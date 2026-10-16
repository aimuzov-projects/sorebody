import { Color, DoubleSide, MeshStandardMaterial, Vector3, Vector4 } from 'three'

/** Цвета среза у края проёма: снаружи и на изнанке, ширина -- в метрах модели. */
export type Rim = { front: string; back: string; inner?: string; frontWidth?: number; backWidth?: number }

/**
 * Кожа: срез толщиной 4 мм. От края проёма наружу -- желтоватая клетчатка (`inner`),
 * затем светлая розоватая дерма (`front`), потом кожа. Изнанка у края -- та же клетчатка.
 */
export const SKIN_RIM: Rim = {
	front: '#f2cdc2',
	inner: '#e8d6a8',
	back: '#e2d0a2',
	frontWidth: 0.004,
	backWidth: 0.006,
}
/** Мышцы и кости: срез в тон слоя, без неона. */
export const MUSCLE_RIM: Rim = { front: '#6b1d1d', back: '#4e1414' }
export const BONE_RIM: Rim = { front: '#d8c9ae', back: '#bfae90' }

/**
 * Матовый "фарфор" с растворением в сфере: фрагменты ближе `uRadius` к `uCenter` отбрасываются,
 * граница рвётся 3D-шумом и подсвечивается тёплой кромкой. Внутренняя сторона оболочки темнее,
 * чтобы срез читался как толща ткани, а не как дыра. `muscle` -- мышечный слой: волокна вдоль
 * главной оси каждой мышцы (атрибут `_fiber`) и подсветка мышц по номерам (`_part`), см. build.mjs.
 */
export function createDissolveMaterial(color: string, rim: string | Rim, roughness = 0.92, muscle = false) {
	const edge = typeof rim === 'string' ? { front: rim, back: rim } : rim

	const uniforms = {
		uCenter: { value: new Vector3() },
		uRadius: { value: 0 },
		// Сдвиг внутрь по нормали в единицах меша: после упрощения мышцы местами пробивают кожу
		uInset: { value: 0 },
		// Срез у края проёма: снаружи -- узкая полоса `front`, на изнанке -- более широкая `back`.
		// У кожи изнанка у края -- светлая дерма и желтоватая подкожка: срез читается толстым
		uRim: { value: new Color(edge.front) },
		uRimWidth: { value: edge.frontWidth ?? 0.003 },
		uRimInner: { value: new Color(edge.inner ?? edge.front) },
		uRimBack: { value: new Color(edge.back) },
		uRimBackWidth: { value: edge.backWidth ?? 0.003 },
		// Радиус проёма во внешнем слое (кожи): слой виден только там, где тот уже растворён.
		// Меньше нуля -- внешнего слоя нет
		uOuter: { value: -1 },
		// Вырез под детальный кусок зоны: сфера xyz + радиус w. Сторона 1 -- слой не рисуется внутри
		// сферы (там его заменяет кусок), -1 -- рисуется только внутри (сам кусок), 0 -- выреза нет
		uCut: { value: new Vector4() },
		uCutSide: { value: 0 },
		// Подсветка зоны: голубое свечение вокруг двух точек (парная зона), к краю -- в серый
		uTint: { value: [new Vector3(), new Vector3()] },
		uTintRadius: { value: 0.1 },
		uTintStrength: { value: 0 },
		uTintColor: { value: new Color('#3d8bfd') },
		// Подсветка мышц травмы: номера мышц из `_part` (до 8, -1 -- пусто) и сила свечения
		uParts: { value: Array.from({ length: 8 }, () => -1) },
		uHighlight: { value: 0 },
		// Сфера `uRadius` снимает только мышцы над подсвеченными, сами они остаются: глубокая мышца травмы
		uPeel: { value: 0 },
	}
	const material = new MeshStandardMaterial({ color, roughness, metalness: 0, side: DoubleSide })

	if (muscle) material.defines = { MUSCLE: '' }

	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms)

		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				`#include <common>
uniform float uInset;
varying vec3 vDissolvePos;
#ifdef MUSCLE
attribute float _part;
attribute vec3 _fiber;
varying float vPart;
varying vec3 vFiber;
#endif`,
			)
			.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
transformed -= objectNormal * uInset;
#ifdef MUSCLE
vPart = _part;
vFiber = _fiber;
#endif`,
			)
			.replace(
				'#include <project_vertex>',
				'#include <project_vertex>\nvDissolvePos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
			)

		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				`#include <common>
uniform vec3 uCenter;
uniform float uRadius;
uniform vec3 uRim;
uniform float uRimWidth;
uniform vec3 uRimInner;
uniform vec3 uRimBack;
uniform float uRimBackWidth;
uniform float uOuter;
uniform vec4 uCut;
uniform float uCutSide;
uniform vec3 uTint[2];
uniform float uTintRadius;
uniform float uTintStrength;
uniform vec3 uTintColor;
uniform float uParts[8];
uniform float uHighlight;
uniform float uPeel;
varying vec3 vDissolvePos;
#ifdef MUSCLE
varying float vPart;
varying vec3 vFiber;
#endif
${NOISE}`,
			)
			.replace(
				'#include <clipping_planes_fragment>',
				`#include <clipping_planes_fragment>
if ((distance(vDissolvePos, uCut.xyz) - uCut.w) * uCutSide < 0.0) discard;
// Мышца травмы: номер из _part среди подсвеченных
float hit = 0.0;
#ifdef MUSCLE
if (uHighlight > 0.0) for (int i = 0; i < 8; i++) hit = max(hit, 1.0 - step(0.5, abs(vPart - uParts[i])));
#endif
bool kept = uPeel > 0.5 && hit > 0.5;
float dissolveEdge = 1.0;
// Край проёма: лёгкая органика без зубцов -- шум редкий и слабый
float n = snoise(vDissolvePos * 4.0) * 0.7 + snoise(vDissolvePos * 11.0) * 0.3;
// Граница проёма во внешнем слое -- той же формулой с шумом, что у него самого
if (uOuter >= 0.0 && distance(vDissolvePos, uCenter) - uOuter + n * 0.007 * smoothstep(0.0, 0.05, uOuter) > 0.0) discard;
if (uRadius > 0.0) {
	float d = distance(vDissolvePos, uCenter) - uRadius + n * 0.007 * smoothstep(0.0, 0.05, uRadius);
	if (d < 0.0 && !kept) discard;
	if (!kept) dissolveEdge = d / (gl_FrontFacing ? uRimWidth : uRimBackWidth);
}`,
			)
			.replace(
				'#include <color_fragment>',
				`#include <color_fragment>
if (!gl_FrontFacing) diffuseColor.rgb *= 0.62;
#ifdef MUSCLE
// Волокна: шум по координатам поперёк главной оси мышцы, вдоль неё он не меняется -- выходят
// тонкие продольные тяжи, как на атласе. У мышц без оси (мимо build.mjs) волокон нет
float fiberLength = length(vFiber);
if (fiberLength > 0.1) {
	vec3 axis = vFiber / fiberLength;
	vec3 across = vDissolvePos - dot(vDissolvePos, axis) * axis;
	float fibers = snoise(across * 420.0) * 0.6 + snoise(across * 1100.0 + 3.7) * 0.4;
	float bundles = snoise(vDissolvePos * 60.0);
	diffuseColor.rgb *= 0.9 + 0.12 * fibers + 0.05 * bundles;
}
// Подсветка мышц травмы: они остаются красными и чуть светятся, остальные бледнеют
if (uHighlight > 0.0) {
	float pale = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) * 1.2 + 0.12;
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(pale), uHighlight * (1.0 - hit));
}
#endif`,
			)
			.replace(
				'#include <emissivemap_fragment>',
				`#include <emissivemap_fragment>
if (uTintStrength > 0.0) {
	float near = min(distance(vDissolvePos, uTint[0]), distance(vDissolvePos, uTint[1]));
	totalEmissiveRadiance += uTintColor * uTintStrength * (1.0 - smoothstep(0.0, uTintRadius, near));
}
#ifdef MUSCLE
totalEmissiveRadiance += diffuseColor.rgb * 0.5 * uHighlight * hit;
#endif`,
			)
			.replace(
				'#include <dithering_fragment>',
				`#include <dithering_fragment>
// Изнанка у края: у самого среза -- цвет \`back\`, дальше мягко в обычную тёмную изнанку
float edgeMix = smoothstep(0.7, 1.0, dissolveEdge);
// Снаружи у самого края -- нижний слой (inner), за ним мягко верхний (front)
vec3 cut = gl_FrontFacing ? mix(uRimInner, uRim, smoothstep(0.45, 0.65, dissolveEdge)) : uRimBack;
gl_FragColor.rgb = mix(cut, gl_FragColor.rgb, edgeMix);`,
			)
	}

	return { material, uniforms }
}

// Simplex 3D, Ian McEwan / Ashima Arts, MIT
const NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
	const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
	const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
	vec3 i = floor(v + dot(v, C.yyy));
	vec3 x0 = v - i + dot(i, C.xxx);
	vec3 g = step(x0.yzx, x0.xyz);
	vec3 l = 1.0 - g;
	vec3 i1 = min(g.xyz, l.zxy);
	vec3 i2 = max(g.xyz, l.zxy);
	vec3 x1 = x0 - i1 + C.xxx;
	vec3 x2 = x0 - i2 + C.yyy;
	vec3 x3 = x0 - D.yyy;
	i = mod289(i);
	vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
	float n_ = 0.142857142857;
	vec3 ns = n_ * D.wyz - D.xzx;
	vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
	vec4 x_ = floor(j * ns.z);
	vec4 y_ = floor(j - 7.0 * x_);
	vec4 x = x_ * ns.x + ns.yyyy;
	vec4 y = y_ * ns.x + ns.yyyy;
	vec4 h = 1.0 - abs(x) - abs(y);
	vec4 b0 = vec4(x.xy, y.xy);
	vec4 b1 = vec4(x.zw, y.zw);
	vec4 s0 = floor(b0) * 2.0 + 1.0;
	vec4 s1 = floor(b1) * 2.0 + 1.0;
	vec4 sh = -step(h, vec4(0.0));
	vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
	vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
	vec3 p0 = vec3(a0.xy, h.x);
	vec3 p1 = vec3(a0.zw, h.y);
	vec3 p2 = vec3(a1.xy, h.z);
	vec3 p3 = vec3(a1.zw, h.w);
	vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
	p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
	vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
	m = m * m;
	return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`
