function loadShader(gl, type, source) {
	const shader = gl.createShader(type);
	if (shader == null) {
		throw new Error('falied to create shader');
	}

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error(`falied to compile shader: ${gl.getShaderInfoLog(shader)}`);
		gl.deleteShader(shader);
		throw new Error(`falied to compile shader: ${gl.getShaderInfoLog(shader)}`);
	}

	return shader;
}

function initShaderProgram(gl, vsSource, fsSource) {
	const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
	const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

	const shaderProgram = gl.createProgram();

	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);

	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		console.error(`failed to init shader: ${gl.getProgramInfoLog(shaderProgram)}`);
		throw new Error('failed to init shader');
	}

	return shaderProgram;
}

function createEmptyTexture(gl) {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.bindTexture(gl.TEXTURE_2D, null);
	return texture;
}

function createEmptyTextureArray(gl) {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
	return texture;
}

async function createTextureFromUrl(gl, url) {
	const texture = gl.createTexture();
	const image = new Image();
	image.crossOrigin = 'anonymous';
	image.src = url;
	await image.decode();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
	gl.generateMipmap(gl.TEXTURE_2D);
	gl.bindTexture(gl.TEXTURE_2D, null);
	return texture;
}

async function createTextureArrayFromUrl(gl, url) {
	const texture = gl.createTexture();
	const image = new Image();
	image.crossOrigin = 'anonymous';
	image.src = url;
	await image.decode();
	gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
	gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
	gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
	gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
	return texture;
}

function makeGl(canvas, vertexShader, fragmentShader) {
	let width = canvas.offsetWidth;
	let height = canvas.offsetHeight;
	canvas.width = width;
	canvas.height = height;

	const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: false, alpha: true, premultipliedAlpha: false, antialias: true });

	const VERTICES = new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]);
	const vertexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, VERTICES, gl.STATIC_DRAW);

	const shaderProgram = initShaderProgram(gl, vertexShader, fragmentShader);
	gl.useProgram(shaderProgram);

	const positionLocation = gl.getAttribLocation(shaderProgram, 'position');
	gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(positionLocation);

	const in_resolution = gl.getUniformLocation(shaderProgram, 'in_resolution');
	gl.uniform2fv(in_resolution, [width, height]);

	const u_time = gl.getUniformLocation(shaderProgram, 'u_time');

	// 誰が見ても同じレンダリング結果になるように、開いた時間を基準にする
	// ただそのままUNIX時間を入れると、秒数が大きすぎて浮動小数点数の関係で精度が落ちるため、1日間隔でループ
	const initialTime = Date.now() % (1000 * 60 * 60 * 24);

	let hook;

	function render(frame) {
		let sizeChanged = false;
		if (Math.abs(height - canvas.offsetHeight) > 2) {
			height = canvas.offsetHeight;
			canvas.height = height;
			sizeChanged = true;
		}
		if (Math.abs(width - canvas.offsetWidth) > 2) {
			width = canvas.offsetWidth;
			canvas.width = width;
			sizeChanged = true;
		}
		if (sizeChanged && gl) {
			gl.uniform2fv(in_resolution, [width, height]);
			gl.viewport(0, 0, width, height);
		}

		// debug
		//const timeStamp = 604800000 + initialTime + frame;
		const timeStamp = initialTime + frame;
		gl.uniform1i(u_time, timeStamp);

		if (hook) hook(timeStamp);

		gl.drawArrays(gl.TRIANGLES, 0, 6);

		window.requestAnimationFrame(render);
	}

	return {
		gl: gl,
		program: shaderProgram,
		render: (cb) => {
			hook = cb;
			window.requestAnimationFrame(render);
		},
	};
}

const GLSL_COMMON = `
const float PI = 3.141592653589793;
const float TWO_PI = 6.283185307179586;
const float HALF_PI = 1.5707963267948966;

float blendNormal(float base, float blend) {
	return blend;
}
vec3 blendNormal(vec3 base, vec3 blend) {
	return blend;
}

float blendAdd(float base, float blend) {
	return min(base + blend, 1.0);
}
vec3 blendAdd(vec3 base, vec3 blend) {
	return min(base + blend, vec3(1.0));
}

float blendSubtract(float base, float blend) {
	return max(base + blend - 1.0, 0.0);
}
vec3 blendSubtract(vec3 base, vec3 blend) {
	return max(base + blend - vec3(1.0), vec3(0.0));
}

float blendMultiply(float base, float blend) {
	return base * blend;
}
vec3 blendMultiply(vec3 base, vec3 blend) {
	return base * blend;
}

float blendDarken(float base, float blend) {
	return min(blend, base);
}
vec3 blendDarken(vec3 base, vec3 blend) {
	return vec3(blendDarken(base.r, blend.r), blendDarken(base.g, blend.g), blendDarken(base.b, blend.b));
}

float blendLighten(float base, float blend) {
	return max(blend, base);
}
vec3 blendLighten(vec3 base, vec3 blend) {
	return vec3(blendLighten(base.r, blend.r), blendLighten(base.g, blend.g), blendLighten(base.b, blend.b));
}

float blendScreen(float base, float blend) {
	return 1.0 - ((1.0 - base) * (1.0 - blend));
}
vec3 blendScreen(vec3 base, vec3 blend) {
	return vec3(blendScreen(base.r, blend.r), blendScreen(base.g, blend.g), blendScreen(base.b, blend.b));
}

float blendOverlay(float base, float blend) {
	return base < 0.5 ? (2.0 * base * blend) : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend));
}
vec3 blendOverlay(vec3 base, vec3 blend) {
	return vec3(blendOverlay(base.r, blend.r), blendOverlay(base.g, blend.g), blendOverlay(base.b, blend.b));
}

// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20201014 (stegu)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise

vec3 mod289(vec3 x) {
	return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
	return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
	return mod289(((x * 34.0) + 10.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
	return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
	const vec2 C = vec2(1.0/6.0, 1.0/3.0);
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
	vec4 p = permute(permute(permute(
						i.z + vec4(0.0, i1.z, i2.z, 1.0))
					+ i.y + vec4(0.0, i1.y, i2.y, 1.0))
					+ i.x + vec4(0.0, i1.x, i2.x, 1.0));

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
	p0 *= norm.x;
	p1 *= norm.y;
	p2 *= norm.z;
	p3 *= norm.w;

	vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
	m = m * m;
	return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;
