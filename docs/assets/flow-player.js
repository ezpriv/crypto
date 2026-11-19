// Three.js step player for the example flows. A page has <div class="player" data-flow="./flow.js">,
// and flow.js exports { actors, steps } (see docs/README.md for the format).
import * as THREE from "./vendor/three-0.187.0/three.module.js";

const TONES = {
	secret: "#f5b14c",
	public: "#7aa7ff",
	cipher: "#3dd6a5",
	plain: "#d7dceb",
	session: "#b39dff",
	danger: "#ff6b6b",
};
const KIND_COLOR = {
	phone: "#7aa7ff",
	computer: "#7aa7ff",
	server: "#3dd6a5",
	cloud: "#b39dff",
	authenticator: "#f5b14c",
	store: "#b39dff",
	attacker: "#ff6b6b",
};
const TOP = {
	phone: 1.85,
	computer: 1.95,
	server: 1.45,
	cloud: 1.6,
	authenticator: 1.55,
	store: 1.35,
	attacker: 1.65,
};
const LEGEND = [
	["secret", "secret"],
	["public", "public"],
	["cipher", "encrypted"],
	["session", "token"],
	["danger", "refused"],
];
const SCALE = 1.3;
const CURVE = 0.03; // outer actors sit a little closer to the camera
const DURATION = { local: 1.5, message: 1.9, refused: 2.4, hold: 1.1 };
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

export const parseItem = (item) => {
	const i = item.indexOf(":");
	return { tone: item.slice(0, i), label: item.slice(i + 1) };
};

/** What each actor holds before step `k` runs. */
export function holdingsBefore(flow, k) {
	const held = new Map(flow.actors.map((a) => [a.id, [...(a.holds ?? [])]]));
	for (const step of flow.steps.slice(0, k)) {
		for (const [id, labels] of Object.entries(step.drop ?? {})) {
			held.set(
				id,
				(held.get(id) ?? []).filter(
					(item) => !labels.includes(parseItem(item).label),
				),
			);
		}
		for (const [id, items] of Object.entries(step.add ?? {})) {
			held.get(id)?.push(...items);
		}
	}
	return held;
}

function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function chip(item, fresh = false) {
	const { tone, label } = parseItem(item);
	const node = el("span", `chip ${tone}${fresh ? " fresh" : ""}`);
	node.title = label;
	node.append(el("span", "", label));
	return node;
}

function glowTexture() {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 64;
	const ctx = canvas.getContext("2d");
	const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	g.addColorStop(0, "rgba(255,255,255,1)");
	g.addColorStop(0.35, "rgba(255,255,255,0.35)");
	g.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 64, 64);
	return new THREE.CanvasTexture(canvas);
}

function buildActor(kind, color) {
	const group = new THREE.Group();
	const materials = [];
	const body = (geometry, y, x = 0) => {
		const material = new THREE.MeshStandardMaterial({
			color: 0x1a2340,
			metalness: 0.35,
			roughness: 0.45,
			emissive: new THREE.Color(color),
			emissiveIntensity: 0.07,
		});
		materials.push(material);
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(x, y, 0);
		mesh.add(
			new THREE.LineSegments(
				new THREE.EdgesGeometry(geometry, 25),
				new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
			),
		);
		group.add(mesh);
		return mesh;
	};
	const screen = (parent, w, h, z) => {
		const mesh = new THREE.Mesh(
			new THREE.PlaneGeometry(w, h),
			new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 }),
		);
		mesh.position.z = z;
		parent.add(mesh);
	};
	if (kind === "phone" || kind === "attacker") {
		const phone = body(new THREE.BoxGeometry(0.85, 1.6, 0.12), 0.95);
		screen(phone, 0.7, 1.36, 0.061);
		if (kind === "attacker") {
			const eye = body(new THREE.OctahedronGeometry(0.22), 2.0);
			group.userData.spin = eye;
		}
	} else if (kind === "computer") {
		const monitor = body(new THREE.BoxGeometry(1.9, 1.15, 0.1), 1.3);
		screen(monitor, 1.76, 1.02, 0.051);
		body(new THREE.BoxGeometry(0.12, 0.62, 0.12), 0.42);
		body(new THREE.BoxGeometry(0.8, 0.06, 0.45), 0.09);
	} else if (kind === "server") {
		for (let i = 0; i < 3; i++) {
			const unit = body(
				new THREE.BoxGeometry(1.5, 0.36, 0.95),
				0.22 + i * 0.44,
			);
			const led = new THREE.Mesh(
				new THREE.SphereGeometry(0.045, 12, 8),
				new THREE.MeshBasicMaterial({ color }),
			);
			led.position.set(0.58, 0, 0.48);
			unit.add(led);
		}
	} else if (kind === "cloud") {
		for (const [x, y, r] of [
			[-0.48, 0.75, 0.42],
			[0.08, 0.98, 0.55],
			[0.6, 0.72, 0.38],
		]) {
			body(new THREE.IcosahedronGeometry(r, 1), y, x);
		}
	} else if (kind === "authenticator") {
		body(new THREE.BoxGeometry(0.5, 0.9, 0.18), 0.6);
		body(new THREE.TorusGeometry(0.22, 0.05, 10, 32), 1.25);
	} else {
		body(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 32), 0.6);
	}
	const base = new THREE.Mesh(
		new THREE.RingGeometry(0.95, 1.05, 64),
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }),
	);
	base.rotation.x = -Math.PI / 2;
	base.position.y = 0.01;
	group.add(base);
	group.userData.materials = materials;
	return group;
}

class FlowPlayer {
	constructor(root, flow) {
		this.root = root;
		this.flow = flow;
		this.steps = flow.steps;
		this.current = 0;
		this.elapsed = 0;
		this.running = false;
		this.playing = false;
		this.done = false;
		this.speed = 1;
		this.transient = [];
		this.buildDom();
		this.buildScene();
		this.goTo(0, false);
		this.bindControls();
	}

	buildDom() {
		const root = this.root;
		root.tabIndex = 0;
		this.stage = el("div", "stage");
		this.labels = el("div", "labels");
		const legend = el("div", "stage-note");
		for (const [tone, label] of LEGEND) legend.append(chip(`${tone}:${label}`));
		this.stage.append(this.labels, legend);
		this.caption = el("div", "caption");
		this.caption.setAttribute("aria-live", "polite");
		this.progress = el("div", "progress");
		this.progress.append(el("div"));
		const controls = el("div", "controls");
		const button = (cls, text, title) => {
			const b = el("button", cls);
			b.type = "button";
			b.title = title;
			b.setAttribute("aria-label", title);
			b.append(el("span", "", text));
			controls.append(b);
			return b;
		};
		this.restartButton = button("restart", "⟲", "Restart");
		this.prevButton = button("prev", "◀", "Previous step");
		this.playButton = button("play", "▶ Play", "Play or pause");
		this.nextButton = button("next", "▶|", "Next step");
		controls.append(el("span", "spacer"));
		this.speedSelect = el("select");
		this.speedSelect.setAttribute("aria-label", "Speed");
		for (const s of [0.5, 1, 1.5, 2]) {
			const option = el("option", "", `${s}×`);
			option.value = String(s);
			option.selected = s === 1;
			this.speedSelect.append(option);
		}
		controls.append(this.speedSelect);
		this.list = el("ol", "steps");
		this.items = this.steps.map((step, i) => {
			const li = el("li", step.attack ? "attack" : "");
			const b = el("button", "", step.title);
			b.type = "button";
			b.addEventListener("click", () => {
				this.playing = false;
				this.goTo(i, true);
			});
			li.append(b);
			this.list.append(li);
			return li;
		});
		const wrap = el("div");
		wrap.style.gridArea = "caption";
		wrap.append(this.progress, this.caption);
		root.replaceChildren(this.stage, wrap, controls, this.list);
	}

	buildScene() {
		try {
			this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		} catch {
			// No WebGL here: the caption and step list still explain the flow.
			this.root.classList.add("no-webgl");
			return;
		}
		this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.stage.prepend(this.renderer.domElement);
		this.scene = new THREE.Scene();
		this.scene.fog = new THREE.Fog(0x0a0f1e, 14, 30);
		this.scene.background = new THREE.Color(0x0a0f1e);
		this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 100);
		this.scene.add(new THREE.HemisphereLight(0xa9bcff, 0x0a0f1e, 1.1));
		const sun = new THREE.DirectionalLight(0xffffff, 1.6);
		sun.position.set(4, 9, 7);
		this.scene.add(sun);
		const floor = new THREE.Mesh(
			new THREE.CircleGeometry(60, 64),
			new THREE.MeshStandardMaterial({ color: 0x0c1328, roughness: 0.95 }),
		);
		floor.rotation.x = -Math.PI / 2;
		this.scene.add(floor);
		const grid = new THREE.GridHelper(80, 80, 0x2b3b69, 0x1c2747);
		grid.material.transparent = true;
		grid.material.opacity = 0.45;
		grid.position.y = 0.005;
		this.scene.add(grid);
		this.glow = glowTexture();

		const n = this.flow.actors.length;
		const spacing = n > 5 ? 3.9 : n > 3 ? 4.3 : 4.8;
		const outer = ((n - 1) / 2) * spacing;
		this.halfWidth = outer + 2.7;
		this.depth = CURVE * outer * outer;
		this.actors = new Map();
		this.flow.actors.forEach((actor, i) => {
			const x = (i - (n - 1) / 2) * spacing;
			const color = KIND_COLOR[actor.kind] ?? "#7aa7ff";
			const group = buildActor(actor.kind, color);
			group.position.set(x, 0, CURVE * x * x);
			group.scale.setScalar(SCALE);
			this.scene.add(group);
			const label = el("div", "actor-label");
			label.append(el("div", "name", actor.name));
			if (actor.note) label.append(el("div", "note", actor.note));
			const chips = el("div", "chips");
			label.append(chips);
			this.labels.append(label);
			this.actors.set(actor.id, {
				group,
				label,
				chips,
				color,
				top: (TOP[actor.kind] ?? 1.6) * SCALE,
			});
		});

		this.distance = 12;
		this.resize();
		this.camera.position.set(0, this.distance * 0.34, this.distance);
		this.pointer = new THREE.Vector2();
		this.stage.addEventListener("pointermove", (e) => {
			const r = this.stage.getBoundingClientRect();
			this.pointer.set(
				((e.clientX - r.left) / r.width) * 2 - 1,
				((e.clientY - r.top) / r.height) * 2 - 1,
			);
		});
		new ResizeObserver(() => this.resize()).observe(this.stage);
		this.visible = false;
		new IntersectionObserver(([entry]) => {
			this.visible = entry.isIntersecting;
			if (this.visible && !this.started && !reduceMotion) {
				this.started = true;
				this.play();
			}
		}).observe(this.stage);
		this.clock = new THREE.Timer();
		this.renderer.setAnimationLoop(() => this.frame());
	}

	resize() {
		const { clientWidth: w, clientHeight: h } = this.stage;
		if (!w || !h) return;
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		const hfov =
			2 *
			Math.atan(
				Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) *
					this.camera.aspect,
			);
		this.distance = Math.max(
			8.5,
			this.halfWidth / Math.tan(hfov / 2) + this.depth,
		);
		this.scene.fog.near = this.distance * 1.1;
		this.scene.fog.far = this.distance * 2.6;
		const labelWidth = `${Math.min(170, w / this.actors.size - 6)}px`;
		for (const actor of this.actors.values())
			actor.label.style.width = labelWidth;
		this.camera.updateProjectionMatrix();
	}

	anchor(id, y) {
		const actor = this.actors.get(id);
		return actor.group.position.clone().setY(y ?? actor.top);
	}

	toScreen(position) {
		const v = position.clone().project(this.camera);
		return [
			((v.x + 1) / 2) * this.stage.clientWidth,
			((1 - v.y) / 2) * this.stage.clientHeight,
		];
	}

	place(node, position, shift = "translate(-50%, -100%)") {
		const [x, y] = this.toScreen(position);
		node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${shift}`;
	}

	clearTransient() {
		for (const item of this.transient) {
			if (item.isObject3D) {
				this.scene.remove(item);
				item.traverse((o) => {
					o.geometry?.dispose();
					o.material?.dispose();
				});
			} else {
				item.remove();
			}
		}
		this.transient = [];
	}

	setupStep(step) {
		this.ring = this.curve = this.callLabel = this.packetLabel = null;
		if (!this.scene) return;
		const kind = step.at ? "local" : step.refused ? "refused" : "message";
		this.kind = kind;
		this.duration = DURATION[kind];
		if (kind === "local") {
			const actor = this.actors.get(step.at);
			const ring = new THREE.Mesh(
				new THREE.RingGeometry(0.9, 1.0, 64),
				new THREE.MeshBasicMaterial({ color: actor.color, transparent: true }),
			);
			ring.rotation.x = -Math.PI / 2;
			ring.position.copy(actor.group.position).setY(0.03);
			this.scene.add(ring);
			this.ring = ring;
			this.transient.push(ring);
			if (step.call) {
				this.callLabel = el("div", "call-label");
				this.callLabel.append(el("span", "", step.call));
				this.labels.append(this.callLabel);
				this.transient.push(this.callLabel);
			}
			return;
		}
		const { tone, label } = parseItem(step.carry ?? "plain:message");
		const color = new THREE.Color(TONES[tone] ?? TONES.plain);
		const from = this.anchor(step.from);
		const to = this.anchor(step.to);
		const mid = from.clone().lerp(to, 0.5);
		mid.y = Math.max(from.y, to.y) + 0.7 + from.distanceTo(to) * 0.08;
		this.curve = new THREE.QuadraticBezierCurve3(from, mid, to);
		const packet = new THREE.Group();
		packet.add(
			new THREE.Mesh(
				new THREE.SphereGeometry(0.14, 24, 16),
				new THREE.MeshBasicMaterial({ color }),
			),
			new THREE.Sprite(
				new THREE.SpriteMaterial({
					map: this.glow,
					color,
					blending: THREE.AdditiveBlending,
					depthWrite: false,
					transparent: true,
				}),
			),
		);
		packet.children[1].scale.setScalar(1.3);
		this.packet = packet;
		const points = this.curve.getPoints(64);
		const trail = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints(points),
			new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }),
		);
		trail.geometry.setDrawRange(0, 0);
		this.trail = trail;
		this.scene.add(packet, trail);
		this.packetLabel = el("div", "packet-label");
		this.packetLabel.style.color = TONES[tone] ?? TONES.plain;
		this.packetLabel.append(el("span", "", label));
		this.labels.append(this.packetLabel);
		this.transient.push(packet, trail, this.packetLabel);
	}

	goTo(k, run) {
		this.current = k;
		this.elapsed = 0;
		this.done = false;
		this.running = run;
		this.clearTransient();
		this.renderHoldings(holdingsBefore(this.flow, k));
		this.setupStep(this.steps[k]);
		this.updateUi();
		if (!this.scene && run) this.finishStep();
	}

	finishStep() {
		this.running = false;
		this.done = true;
		const step = this.steps[this.current];
		this.renderHoldings(
			holdingsBefore(this.flow, this.current + 1),
			step.add ?? {},
		);
		this.updateUi();
		if (!this.playing) return;
		if (this.current + 1 >= this.steps.length) {
			this.playing = false;
			this.updateUi();
			return;
		}
		this.holdTimer = setTimeout(
			() => {
				if (this.playing) this.goTo(this.current + 1, true);
			},
			(DURATION.hold * 1000) / this.speed,
		);
	}

	renderHoldings(held, fresh = {}) {
		if (!this.actors) return;
		for (const [id, actor] of this.actors) {
			const added = new Set(fresh[id] ?? []);
			actor.chips.replaceChildren(
				...(held.get(id) ?? []).map((item) => chip(item, added.has(item))),
			);
		}
	}

	updateUi() {
		const step = this.steps[this.current];
		const n = this.steps.length;
		const count = el(
			"div",
			"count",
			`Step ${this.current + 1} of ${n}${step.attack ? " · attack" : ""}`,
		);
		const parts = [count, el("h3", "", step.title), el("p", "", step.text)];
		if (step.call) {
			const call = el("code", "call", step.call);
			parts.push(call);
		}
		this.caption.replaceChildren(...parts);
		this.items.forEach((li, i) => {
			li.classList.toggle("current", i === this.current);
			li.classList.toggle(
				"done",
				i < this.current || (i === this.current && this.done),
			);
		});
		const li = this.items[this.current];
		const list = this.list;
		if (
			li.offsetTop < list.scrollTop ||
			li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight
		) {
			list.scrollTop = li.offsetTop - list.clientHeight / 3;
		}
		const finished = this.done && this.current === n - 1;
		this.playButton.firstChild.textContent = this.playing
			? "❚❚ Pause"
			: finished
				? "⟲ Replay"
				: "▶ Play";
		this.prevButton.disabled = this.current === 0;
		this.nextButton.disabled = this.current === n - 1 && this.done;
		this.progress.firstChild.style.width = `${((this.current + (this.done ? 1 : 0)) / n) * 100}%`;
	}

	play() {
		clearTimeout(this.holdTimer);
		const n = this.steps.length;
		this.playing = true;
		if (this.done && this.current === n - 1) this.goTo(0, true);
		else if (this.done) this.goTo(this.current + 1, true);
		else {
			this.running = true;
			if (!this.scene) this.finishStep();
		}
		this.updateUi();
	}

	pause() {
		clearTimeout(this.holdTimer);
		this.playing = false;
		this.running = false;
		this.updateUi();
	}

	bindControls() {
		this.playButton.addEventListener("click", () =>
			this.playing ? this.pause() : this.play(),
		);
		this.prevButton.addEventListener("click", () => {
			this.pause();
			this.goTo(Math.max(0, this.current - 1), true);
		});
		this.nextButton.addEventListener("click", () => {
			this.pause();
			if (!this.done && this.elapsed === 0) this.goTo(this.current, true);
			else this.goTo(Math.min(this.steps.length - 1, this.current + 1), true);
		});
		this.restartButton.addEventListener("click", () => {
			clearTimeout(this.holdTimer);
			this.playing = true;
			this.goTo(0, true);
		});
		this.speedSelect.addEventListener("change", () => {
			this.speed = Number(this.speedSelect.value);
		});
		this.root.addEventListener("keydown", (e) => {
			if (e.target.closest("select")) return;
			const keys = {
				ArrowRight: this.nextButton,
				ArrowLeft: this.prevButton,
				" ": this.playButton,
				Home: this.restartButton,
			};
			if (keys[e.key]) {
				e.preventDefault();
				keys[e.key].click();
			}
		});
	}

	frame() {
		this.clock.update();
		const dt = Math.min(this.clock.getDelta(), 0.1);
		if (!this.visible) return;
		const t = this.clock.getElapsed();
		if (this.running) {
			this.elapsed += (reduceMotion ? 10 : 1) * dt * this.speed;
		}
		const p = Math.min(1, this.elapsed / this.duration);
		const ease = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
		const step = this.steps[this.current];
		const sway = reduceMotion ? 0 : Math.sin(t * 0.25) * 0.6;
		const target = new THREE.Vector3(0, -0.1, 0);
		const want = new THREE.Vector3(
			sway + this.pointer.x * 0.8,
			this.distance * 0.34 - this.pointer.y * 0.4,
			this.distance,
		);
		this.camera.position.lerp(want, 0.06);
		this.camera.lookAt(target);

		for (const [id, actor] of this.actors) {
			const involved = step.at === id || step.from === id || step.to === id;
			const glow = involved && this.running ? 0.32 : 0.07;
			for (const m of actor.group.userData.materials) {
				m.emissiveIntensity += (glow - m.emissiveIntensity) * 0.1;
			}
			actor.group.userData.spin?.rotation.set(t * 0.7, t, 0);
			this.place(
				actor.label,
				actor.group.position.clone().setY(-0.25),
				"translate(-50%, 0)",
			);
		}

		if (this.kind === "local" && this.ring) {
			const wave = (p * 2) % 1;
			this.ring.scale.setScalar(SCALE * (1 + wave * 0.9));
			this.ring.material.opacity =
				this.running || !this.done ? 0.8 * (1 - wave) : 0;
			if (this.callLabel) {
				this.callLabel.style.opacity = this.done ? "0.85" : "1";
				this.place(
					this.callLabel,
					this.anchor(step.at).setY(
						this.actors.get(step.at).top + 0.35 + ease * 0.25,
					),
				);
			}
		} else if (this.curve) {
			const stopAt = this.kind === "refused" ? 0.8 : 1;
			const travel =
				Math.min(1, ease / (this.kind === "refused" ? 0.75 : 1)) * stopAt;
			const point = this.curve.getPoint(travel);
			if (this.kind === "refused" && p > 0.7) {
				point.x += Math.sin(t * 60) * 0.05 * (1 - p);
				this.packet.children[0].material.color.set(TONES.danger);
				this.packet.children[1].material.color.set(TONES.danger);
				this.trail.material.color.set(TONES.danger);
				if (!this.packetLabel.classList.contains("refused")) {
					this.packetLabel.classList.add("refused");
					this.packetLabel.style.color = TONES.danger;
					this.packetLabel.replaceChildren(el("span", "", `✕ ${step.refused}`));
				}
			}
			this.packet.position.copy(point);
			this.packet.visible = this.elapsed > 0;
			this.packetLabel.style.opacity = this.elapsed > 0 ? "1" : "0";
			this.trail.geometry.setDrawRange(0, Math.floor(travel * 65));
			if (this.done && this.kind === "message") {
				this.packet.scale.multiplyScalar(0.9);
				this.trail.material.opacity *= 0.95;
				this.packetLabel.style.opacity = "0";
			}
			this.place(this.packetLabel, point.clone().setY(point.y + 0.35));
		}

		if (this.running && p >= 1) this.finishStep();
		this.renderer.render(this.scene, this.camera);
	}
}

for (const root of document.querySelectorAll(".player[data-flow]")) {
	const url = new URL(root.dataset.flow, location.href);
	import(url.href).then(({ default: flow }) => new FlowPlayer(root, flow));
}
