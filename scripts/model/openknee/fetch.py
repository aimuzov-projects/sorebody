"""Скачивает из Data Share Open Knee(s) (SimTK, набор OKS_models) только нужное из расчёта колена.

usage: fetch.py <колено, oks008> <папка> [шаг, градусы]

Файл результатов FEBio (`final model/FeBio_custom.xplt`) весит 12 ГБ, а сервер отдаёт около 150 КБ/с.
Нужны из него сетка (корневой блок, ~100 МБ) и смещения узлов в кадрах через `шаг` градусов
(по 6,6 МБ): их скрипт берёт запросами Range. Угол кадра -- по `processed results` того же колена.
"""
import json, os, re, struct, subprocess, sys, tempfile, urllib.parse
from concurrent.futures import ThreadPoolExecutor

SITE = 'https://simtk.org/plugins/datashare/view.php'
CONNECTOR = 'https://datashare.simtk.org/apps/import/php/connector.mobilizeds.readonly.php'
STUDY = 32  # OKS_models, doi:10.18735/b0zv-n395


def curl(*args):
    return subprocess.run(['curl', '-sS', '--fail', '--retry', '5', *args], capture_output=True, check=True).stdout


def connector():
    """Адрес коннектора с токеном: страница набора отдаёт его в адресе iframe."""
    page = curl('-X', 'POST', SITE, '-d', f'id=485&pluginname=datashare&studyid={STUDY}').decode()
    src = re.search(r'src="(https://datashare\.simtk\.org\?[^"]+)"', page).group(1).replace('&amp;', '&')
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(src).query))
    keep = ['section', 'groupid', 'studyid', 'isDOI', 'doi_identifier', 'token', 'private']
    return CONNECTOR + '?' + urllib.parse.urlencode({'study': STUDY, 'templateid': 1, **{k: q[k] for k in keep}})


class Share:
    def __init__(self):
        self.base = connector()

    def open(self, target=''):
        return json.loads(curl(f'{self.base}&cmd=open&target={target}' + ('&init=1' if not target else '')))

    def find(self, path):
        """Хеш файла elFinder по пути в наборе: `oks008/final model/FeBio_custom.xplt`."""
        target = ''
        for name in path.split('/'):
            res = self.open(target)
            cwd = res['cwd']['hash']
            target = next(f['hash'] for f in res['files'] if f['name'] == name and f.get('phash') == cwd)
        return target

    def url(self, h):
        return f'{self.base}&cmd=file&target={h}&download=1'

    def get(self, h, out, start=None, length=None, parts=8):
        if start is None:
            curl(self.url(h), '-o', out)
            return
        step = -(-length // parts)
        tmp = tempfile.mkdtemp(dir=os.path.dirname(os.path.abspath(out)))

        def one(i):
            a = start + i * step
            b = min(start + length, a + step) - 1
            p = os.path.join(tmp, str(i))
            for _ in range(8):
                subprocess.run(['curl', '-sS', '--retry', '5', '-r', f'{a}-{b}', self.url(h), '-o', p], check=False)
                if os.path.exists(p) and os.path.getsize(p) == b - a + 1:
                    data = open(p, 'rb').read()
                    os.remove(p)
                    return data
            raise RuntimeError(f'range {a}-{b} failed')

        with ThreadPoolExecutor(parts) as ex:
            chunks = list(ex.map(one, range(parts)))
        os.rmdir(tmp)
        with open(out, 'wb') as f:
            for c in chunks:
                f.write(c)

    def head(self, h, start, n):
        return curl('-r', f'{start}-{start + n - 1}', self.url(h))


def chunks(buf, pos, end):
    while pos + 8 <= end:
        cid, size = struct.unpack_from('<II', buf, pos)
        yield cid, pos + 8, size
        pos += 8 + size


def main():
    knee, out = sys.argv[1], sys.argv[2]
    step = float(sys.argv[3]) if len(sys.argv) > 3 else 5
    os.makedirs(out, exist_ok=True)
    share = Share()
    final = f'{knee}/final model'

    kin_path = os.path.join(out, 'Tibiofemoral_Kinematics.csv')
    if not os.path.exists(kin_path):
        share.get(share.find(f'{final}/processed results/Tibiofemoral_Kinematics.csv'), kin_path)
    # Анатомические ориентиры: оси снимка и центр мыщелков для prepare.py
    props = os.path.join(out, 'ModelProperties.xml')
    if not os.path.exists(props):
        share.get(share.find(f'{final}/ModelProperties.xml'), props)

    h = share.find(f'{final}/FeBio_custom.xplt')
    size = int(subprocess.run(['curl', '-sSI', share.url(h)], capture_output=True, text=True).stdout.lower().split('content-length:')[1].split()[0])

    # Корень: заголовок, словарь, материалы и сетка. Состояния идут за ним блоками PLT_STATE
    head = share.head(h, 0, 12)
    assert head[:4] == b'BEF\0'
    root_size = struct.unpack_from('<I', head, 8)[0]
    root = os.path.join(out, 'root.bin')
    if not os.path.exists(root) or os.path.getsize(root) != 12 + root_size:
        share.get(h, root, 0, 12 + root_size, 16)

    states_path = os.path.join(out, 'states.json')
    if os.path.exists(states_path):
        states = json.load(open(states_path))
    else:
        states, off = [], 12 + root_size
        while off < size:
            buf = share.head(h, off, 256)
            cid, ssize = struct.unpack_from('<II', buf, 0)
            assert cid == 0x02000000, hex(cid)
            st = {'offset': off, 'size': ssize}
            for c, p, s in chunks(buf, 8, len(buf)):
                if c == 0x02010000:  # заголовок: время
                    for c2, p2, _ in chunks(buf, p, p + s):
                        if c2 == 0x02010002:
                            st['time'] = struct.unpack_from('<f', buf, p2)[0]
                elif c == 0x02020000:  # данные: первая узловая переменная -- смещения
                    for c2, p2, s2 in chunks(buf, p, len(buf)):
                        if c2 == 0x02020300:
                            for c3, p3, s3 in chunks(buf, p2 + 8, len(buf)):
                                if c3 == 0x02020002:
                                    st['var'] = struct.unpack_from('<I', buf, p3)[0]
                                elif c3 == 0x02020003:
                                    st['data'] = [off + p3, s3]
                            break
                    break
            states.append(st)
            off += 8 + ssize
        json.dump(states, open(states_path, 'w'), indent=1)

    rows = [[float(v) for v in l.split(',')[:7]] for l in open(kin_path) if not l.startswith('#')]
    kin = {round(r[0], 4): r for r in rows}
    # Сгибание идёт со времени 1: до него связки получают начальное натяжение
    cands = [(i, s, kin[round(s['time'], 4)]) for i, s in enumerate(states) if s['time'] >= 1 - 1e-6 and round(s['time'], 4) in kin]
    frames, target = [], 0.0
    while target <= -cands[-1][2][4] + 1e-6:
        i, s, k = min(cands, key=lambda c: abs(-c[2][4] - target))
        if not frames or frames[-1]['state'] != i:
            frames.append({'state': i, 'time': s['time'], 'flexion': -k[4], 'kinematics': k[1:7]})
        target += step
    i, s, k = cands[-1]
    if frames[-1]['state'] != i:  # предел расчёта
        frames.append({'state': i, 'time': s['time'], 'flexion': -k[4], 'kinematics': k[1:7]})

    for f in frames:
        s = states[f['state']]
        assert s['var'] == 1, 'первая узловая переменная должна быть displacement'
        p = os.path.join(out, f"disp_{f['state']}.raw")
        if not os.path.exists(p) or os.path.getsize(p) != s['data'][1]:
            share.get(h, p, *s['data'])
        print(f"state {f['state']} t={f['time']:.3f} flexion {f['flexion']:.2f}", flush=True)

    json.dump(frames, open(os.path.join(out, 'frames.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
