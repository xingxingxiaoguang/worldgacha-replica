// Deferred ink renderer: colour + normal + depth G-buffer, then a screen-space
// pass that extracts lines (depth / normal discontinuities) and applies a
// rotated halftone. This mirrors the technique World Gacha uses, written from
// scratch so it is yours to change.
export class InkRenderer {
  constructor(THREE, canvas) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cfd8dd');

    this.camera = new THREE.PerspectiveCamera(34, 1, 1, 7000);
    this.camera.position.set(430, 300, 470);

    this.mode = 'linetone';
    this.lineW = 1.15;
    this.toneScale = 7.6;

    this.normalMat = new THREE.MeshNormalMaterial();
    this.rtColor = new THREE.WebGLRenderTarget(2, 2, { type: THREE.UnsignedByteType });
    this.rtNormal = new THREE.WebGLRenderTarget(2, 2, { type: THREE.UnsignedByteType });
    this.rtColor.depthTexture = new THREE.DepthTexture(2, 2);
    this.rtColor.depthTexture.type = THREE.UnsignedIntType;

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tColor: { value: null },
          tNormal: { value: null },
          tDepth: { value: null },
          res: { value: new THREE.Vector2(2, 2) },
          nearC: { value: this.camera.near },
          farC: { value: this.camera.far },
          mode: { value: 3 },
          lineW: { value: this.lineW },
          toneScale: { value: this.toneScale },
          ink: { value: new THREE.Color('#20262e') },
          paper: { value: new THREE.Color('#f4f1e8') },
        },
        vertexShader: `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
        `,
        fragmentShader: `
          precision highp float;
          uniform sampler2D tColor, tNormal, tDepth;
          uniform vec2 res;
          uniform float nearC, farC, lineW, toneScale;
          uniform int mode;
          uniform vec3 ink, paper;
          varying vec2 vUv;

          float linZ(vec2 uv){
            float d = texture2D(tDepth, uv).x;
            if (d >= 0.99999) return 1e9;
            float ndc = d * 2.0 - 1.0;
            return 2.0 * nearC * farC / (farC + nearC - ndc * (farC - nearC));
          }
          vec3 nrm(vec2 uv){ return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

          float edgeAt(vec2 uv, float r){
            vec2 px = r / res;
            float z0 = linZ(uv);
            if (z0 > 1e8) return 0.0;       // sky: no interior edges
            vec3 n0 = nrm(uv);
            float e = 0.0;
            vec2 dirs[4];
            dirs[0] = vec2(1.0, 0.0); dirs[1] = vec2(0.0, 1.0);
            dirs[2] = vec2(0.7071, 0.7071); dirs[3] = vec2(0.7071, -0.7071);
            for (int k = 0; k < 4; k++){
              vec2 o = dirs[k] * px;
              float za = linZ(uv + o), zb = linZ(uv - o);
              if (za > 1e8 || zb > 1e8) { e = 1.0; continue; }   // silhouette
              // second difference: cancels the smooth depth gradient of a
              // flat plane seen at a grazing angle, keeps real creases
              float e1 = abs(za - (2.0 * z0 - zb)) / max(z0, 1.0);
              float e2 = abs(zb - (2.0 * z0 - za)) / max(z0, 1.0);
              e = max(e, smoothstep(0.006, 0.035, max(e1, e2)));
              float nd = 1.0 - max(dot(n0, nrm(uv + o)), dot(n0, nrm(uv - o)));
              e = max(e, smoothstep(0.12, 0.42, nd));
            }
            return e;
          }

          float halftone(vec2 fc, float amt){
            if (amt <= 0.02) return 0.0;
            vec2 p = fc / toneScale;
            p = vec2(p.x + p.y, p.x - p.y) * 0.7071;
            float d = length(fract(p) - 0.5);
            float r = sqrt(amt / 3.14159) * 0.72;
            return 1.0 - smoothstep(r - 0.045, r + 0.045, d);
          }

          void main(){
            vec2 uv = vUv;
            vec3 col = texture2D(tColor, uv).rgb;
            bool bg = linZ(uv) > 1e8;

            // sky: simple vertical gradient
            if (bg) {
              vec3 top = vec3(0.70, 0.79, 0.86);
              vec3 hor = vec3(0.88, 0.88, 0.85);
              col = mix(hor, top, smoothstep(0.15, 0.95, uv.y));
            }

            float e = 0.0;
            if (mode >= 1) {
              e = max(edgeAt(uv, lineW), edgeAt(uv, lineW * 2.0) * 0.8);
              e *= 0.92;
            }

            vec3 outc;
            if (mode == 9) {
              outc = bg ? vec3(0.9, 0.1, 0.1) : vec3(0.1, 0.3, 0.9);
            } else if (mode == 10) {
              float lm = dot(col, vec3(0.2126, 0.7152, 0.0722));
              outc = vec3(pow(clamp(lm, 0.0, 1.0), 1.0 / 2.2));
            } else if (mode == 11) {
              float lm = dot(col, vec3(0.2126, 0.7152, 0.0722));
              float ll = pow(clamp(lm, 0.0, 1.0), 1.0 / 2.2);
              outc = vec3((1.0 - smoothstep(0.34, 0.95, ll)) * 0.62);
            } else if (mode == 0) {
              outc = col;
            } else if (mode == 1) {
              outc = mix(col, ink, e);
            } else if (mode == 2) {
              outc = mix(paper, ink, e);
            } else {
              float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
              float l = pow(clamp(lum, 0.0, 1.0), 1.0 / 2.2);
              float shade = pow(clamp(1.0 - l, 0.0, 1.0), 2.2) * 0.85;
              if (bg) shade = 0.0;
              float dots = halftone(gl_FragCoord.xy, shade);
              float k = clamp(max(dots * 0.95, e), 0.0, 1.0);
              outc = mix(paper, ink, k);
            }
            gl_FragColor = vec4(outc, 1.0);
          }
        `,
      })
    );
    this.quadScene.add(this.quad);
  }

  setSize(w, h) {
    this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio();
    const pw = Math.max(2, Math.floor(w * dpr));
    const ph = Math.max(2, Math.floor(h * dpr));
    this.rtColor.setSize(pw, ph);
    this.rtNormal.setSize(pw, ph);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.quad.material.uniforms.res.value.set(pw, ph);
  }

  render() {
    const u = this.quad.material.uniforms;
    u.mode.value = { color: 0, colorline: 1, line: 2, linetone: 3, debug: 9, lum: 10, shade: 11 }[this.mode] ?? 3;
    u.lineW.value = this.lineW;
    u.toneScale.value = this.toneScale;
    u.nearC.value = this.camera.near;
    u.farC.value = this.camera.far;

    if (u.mode.value >= 1) {
      this.scene.overrideMaterial = this.normalMat;
      this.renderer.setRenderTarget(this.rtNormal);
      this.renderer.render(this.scene, this.camera);
      this.scene.overrideMaterial = null;
      u.tNormal.value = this.rtNormal.texture;
      u.tDepth.value = this.rtColor.depthTexture;
    }

    this.renderer.setRenderTarget(this.rtColor);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    u.tColor.value = this.rtColor.texture;

    this.renderer.render(this.quadScene, this.quadCam);
  }

  // Render one frame at a fixed size and return a PNG data URL.
  snapshot(w, h) {
    const oldSize = new this.THREE.Vector2();
    this.renderer.getSize(oldSize);
    const oldRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.setSize(w, h);
    this.render();
    const url = this.canvas.toDataURL('image/png');
    this.renderer.setPixelRatio(oldRatio);
    this.setSize(oldSize.x, oldSize.y);
    this.render();
    return url;
  }
}
