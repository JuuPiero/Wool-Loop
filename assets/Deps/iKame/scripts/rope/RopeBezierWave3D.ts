import { _decorator, approx, CCBoolean, CCFloat, CCInteger, clamp01, Color, Component, easing, Enum, MeshRenderer, Node, tween, Tween, Vec2, Vec3 } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { CustomLineMesh } from './CustomLineMesh';
import { darkenColor } from 'db://assets/Scripts/ultils';
const { ccclass, property, executeInEditMode } = _decorator;

export enum EFillDirection {
    StartToEnd,
    EndToStart
}

class RopePoint {
    pos: Vec3
    prev: Vec3
    constructor() {
        this.pos = new Vec3();
        this.prev = new Vec3();
    }
}

function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number, out: Vec3): void {
    let t2 = t * t, t3 = t2 * t;
    // Catmull-Rom spline formula applied per component
    out.set(
        0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
    );
}

// Memory-friendly sampler: writes into out array and returns the count
function sampleCatmullRomOpenOut(pts: Vec3[], subdiv: number, outArr: Vec3[]): number {
    const n = pts?.length;
    subdiv = Math.max(1, subdiv);
    if (n === 0) return 0;

    // ensure capacity in outArr: (n-1)*subdiv + 1
    const need = (n - 1) * subdiv + 1;
    for (let i = outArr?.length; i < need; i++) outArr.push(new Vec3());

    // boundary extrapolated points
    const pMinus1 = new Vec3(
        pts[0].x * 2 - pts[1].x,
        pts[0].y * 2 - pts[1].y,
        pts[0].z * 2 - pts[1].z
    );
    const pN = new Vec3(
        pts[n - 1].x * 2 - pts[n - 2].x,
        pts[n - 1].y * 2 - pts[n - 2].y,
        pts[n - 1].z * 2 - pts[n - 2].z
    );

    let outIdx = 0;
    for (let i = 0; i < n - 1; i++) {
        const p0 = (i === 0) ? pMinus1 : pts[i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = (i + 2 < n) ? pts[i + 2] : pN;

        for (let s = 0; s < subdiv; s++) {
            const t = s / subdiv;
            catmullRom(p0, p1, p2, p3, t, outArr[outIdx++]);
        }
    }
    outArr[outIdx++].set(pts[n - 1]);
    return outIdx;
}

@ccclass('RopeBezierWave3D')
// @executeInEditMode
export class RopeBezierWave3D extends Component {
    //#region End points
    @property(Node) public startPoint: Node;
    @property(Node) public endPoint: Node;
    @property(CCFloat) public scaleRest: number = 1;
    //#endregion

    //#region Rope Discretization
    @property({ type: CCInteger }) public pointCount: number = 16
    @property({ type: CCInteger }) public catmullSubdiv: number = 4;
    //#endregion

    //#region Physic (No Gravity)
    @property({ type: CCFloat, range: [0, 1] })
    public damping: number = 0.03;
    @property({ type: CCFloat, range: [0, 1] })
    public stiffness: number = 0.6;
    @property({ type: CCFloat, range: [0, 1] })
    public lengthStiffness: number = 2;
    @property(CCInteger)
    public solverIterations: number = 5;
    //#endregion

    //#region Stability
    @property(CCInteger) public substep: number = 2;
    @property(CCFloat) public fixedDt: number = 0.02;
    //#endregion

    //#region Amplification
    @property({ type: CCFloat, tooltip: "Khuếch đại xung khi endpoint di chuyển." })
    public waveGain: number = 0.5;
    @property({ type: CCInteger })
    public injectNeighbors: number = 2;
    @property({ type: CCFloat })
    public injectFalloff: number = 0.7;
    @property(CCBoolean)
    public injectPerpendicularOnly: boolean = true;
    @property(CCFloat)
    public injectPerStepClamp: number = 0.03;
    //#endregion

    //#region Drawing
    @property({ type: CCFloat, range: [0, 2] })
    public fillAmount: number = 1;
    @property({ type: Enum(EFillDirection) })
    public fillDirection: EFillDirection = EFillDirection.StartToEnd;
    //#endregion

    //#region Initial Sine Shape
    @property({ tooltip: "Bật để init dây theo đường cong sine (mượt nhẹ) thay vì thẳng.", type: CCBoolean })
    public useInitialSine: boolean = true;

    @property({ tooltip: "Biên độ init theo % chiều dài dây. VD 0.03 = ±3%.", type: CCFloat })
    public initialSineAmplitude: number = 0.03;

    @property({ tooltip: "Số chu kỳ sine từ đầu đến cuối lúc init.", type: CCFloat })
    public initialSineWaves: number = 1.0;

    @property({ tooltip: "Hướng cong ban đầu (nên vuông góc với hướng dây).", type: Vec3 })
    public initialSineUp: Vec3 = new Vec3(0, 1, 0);

    @property({ tooltip: "Chiếu hướng cong vuông góc với hướng dây để đẹp hơn.", type: CCBoolean })
    public initialProjectPerpToRope: boolean = true;

    @property({ tooltip: "Rest length lấy theo đường thẳng (ổn định) hay theo đường cong init (giữ nguyên độ dài cong).", type: CCBoolean })
    public initialRestFromStraightLine: boolean = true;
    //#endregion

    //#region  Internal

    private points: RopePoint[] = [];
    private rest: number[] = [];
    @property(CustomLineMesh)
    public lineRender: CustomLineMesh;

    private lastStart: Vec3 = new Vec3();
    private lastEnd: Vec3 = new Vec3();

    private prevStartPos: Vec3 = new Vec3();
    private prevEndPos: Vec3 = new Vec3();

    private reset(): void {
        if (this.lineRender) {
            this.lineRender.points = [];
        }
        this.pointCount = Math.max(2, this.pointCount);
    }

    protected onEnable(): void {
        if (this.lineRender == null) {
            this.lineRender = this.getComponent(CustomLineMesh);
        }
        this.initIfNeeded(true);
    }

    public initIfNeeded(forceReset: boolean): void {
        if ((!this.startPoint || !this.endPoint) && forceReset) return;

        if (this.points == null || this.points?.length != this.pointCount) {
            this.rest = new Array(this.pointCount - 1);

            for (let i = 0; i < this.pointCount; i++) {
                this.points[i] = new RopePoint();
            }
        }

        let a: Vec3 = new Vec3()
        let b: Vec3 = new Vec3()
        this.startPoint?.getPosition(a);
        this.endPoint?.getPosition(b);
        let totalLenStraight = Vec3.distance(a, b);
        let ropeDir = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z);
        let ropeLen = ropeDir?.length();
        let dirN = ropeLen > 1e-8 ? new Vec3(ropeDir.x / ropeLen, ropeDir.y / ropeLen, ropeDir.z / ropeLen) : Vec3.RIGHT;

        //chọn hướng con init
        let wdir = this.initialSineUp.lengthSqr() > 0 ? this.initialSineUp : Vec3.UP;
        if (this.initialProjectPerpToRope && dirN.lengthSqr() > 0) {
            Vec3.projectOnPlane(wdir, wdir, dirN);
            if (wdir.lengthSqr() < 1e-8) {
                // fall back bất kỳ vuông góc
                Vec3.cross(wdir, dirN, Vec3.UP);
                if (wdir.lengthSqr() < 1e-8) {
                    Vec3.cross(wdir, dirN, Vec3.RIGHT);
                }
            }
        }
        Vec3.normalize(wdir, wdir);

        //đặt điểm đầu theo sine (mượt nhẹ) hoặc thẳng
        const amp = totalLenStraight * this.initialSineAmplitude
        const twoPiK = 2 * Math.PI * Math.max(0, this.initialSineWaves)
        let basePos: Vec3 = new Vec3();
        let offset: Vec3 = new Vec3();
        let p = new Vec3();
        for (let i = 0; i < this.pointCount; i++) {
            const t = i / (this.pointCount - 1);
            Vec3.lerp(basePos, a, b, t);
            offset.set(0, 0, 0);
            if (this.useInitialSine && twoPiK > 0 && amp > 0) {
                offset.x = Math.sin(twoPiK * t) * amp * wdir.x;
                offset.y = Math.sin(twoPiK * t) * amp * wdir.y;
                offset.z = Math.sin(twoPiK * t) * amp * wdir.z;
            }
            p.x = basePos.x + offset.x;
            p.y = basePos.y + offset.y;
            p.z = basePos.z + offset.z;

            this.points[i].pos.set(p.x, p.y, p.z);
            this.points[i].prev.set(p.x, p.y, p.z); // starting from the resting position no gravity
        }

        // rest length
        if (this.initialRestFromStraightLine) {
            // giữ tổng chiều dài nghỉ = khoảng cách 2 đầu (ổn định, ít trùng giãn)
            let pa = new Vec3();
            let pb = new Vec3();
            for (let i = 0; i < this.rest?.length; i++) {
                Vec3.lerp(pa, a, b, i / (this.pointCount - 1));
                Vec3.lerp(pb, a, b, (i + 1) / (this.pointCount - 1));
                this.rest[i] = Vec3.distance(pa, pb);
            }
        }
        else {
            for (let i = 0; i < this.rest?.length; i++) {
                this.rest[i] = Vec3.distance(this.points[i].pos, this.points[i + 1].pos);
            }
        }

        this.lastStart.set(a.x, a.y, a.z);
        this.lastEnd.set(b.x, b.y, b.z);
        this.prevStartPos.set(a.x, a.y, a.z);
        this.prevEndPos.set(b.x, b.y, b.z);

        this.updateLine();
    }

    private sNow: Vec3 = new Vec3();
    private sVel: Vec3 = new Vec3();

    private eNow: Vec3 = new Vec3();
    private eVel: Vec3 = new Vec3();

    protected lateUpdate(dt: number): void {
        if (!this.node.isValid) return
        if (!this.startPoint || !this.endPoint)
            return;
        if (this.points == null || this.points?.length != this.pointCount) {
            this.initIfNeeded(true);
            return;
        }
        this.updateRestIfEndpointsStretch();
        let deltaTime = EDITOR_NOT_IN_PREVIEW ? this.fixedDt : dt;
        deltaTime = Math.max(1e-5, deltaTime);
        const subDt = deltaTime / this.substep;

        for (let s = 0; s < this.substep; s++) {
            // 1 Verlet (điểm giữa)
            this.verletIntegrate(subDt);

            // 2 Inject xung từ endpoint
            this.startPoint?.getPosition(this.sNow);
            this.endPoint?.getPosition(this.eNow);
            Vec3.subtract(this.sVel, this.sNow, this.prevStartPos);
            Vec3.subtract(this.eVel, this.eNow, this.prevEndPos);

            this.injectEndpointImpulse(this.sVel, true);
            this.injectEndpointImpulse(this.eVel, false);

            // 3 Lock the 2 end
            this.points[0].pos.set(this.sNow.x, this.sNow.y, this.sNow.z);
            this.points[this.pointCount - 1].pos.set(this.eNow.x, this.eNow.y, this.eNow.z);

            // 4 Constrain the length of the line
            for (let it = 0; it < this.solverIterations; it++) {
                this.applyLengthConstraints();
                this.points[0].pos.set(this.sNow.x, this.sNow.y, this.sNow.z);
                this.points[this.pointCount - 1].pos.set(this.eNow.x, this.eNow.y, this.eNow.z);
            }
            // sync prev endpoints (không dùng tính sVel/eVel)
            this.prevStartPos.set(this.sNow.x, this.sNow.y, this.sNow.z);
            this.prevEndPos.set(this.eNow.x, this.eNow.y, this.eNow.z);

            if (s == this.substep - 1) {
                this.prevStartPos.set(this.sNow.x, this.sNow.y, this.sNow.z);
                this.prevEndPos.set(this.eNow.x, this.eNow.y, this.eNow.z);
            }
        }
        this.updateLine();
    }

    public setEndPointPosition(pos: Vec3) {
        if (this.endPoint) {
            this.endPoint.setPosition(pos);
        }
    }


    private pos = new Vec3();
    private newPos = new Vec3();
    private vel = new Vec3();
    private acc = new Vec3();

    private dirLeft = new Vec3();
    private dirRight = new Vec3();

    verletIntegrate(dt: number): void {
        for (let i = 1; i < this.pointCount - 1; i++) {
            this.pos.set(this.points[i].pos.x, this.points[i].pos.y, this.points[i].pos.z);
            this.vel.x = (this.points[i].pos.x - this.points[i].prev.x) * (1 - this.damping);
            this.vel.y = (this.points[i].pos.y - this.points[i].prev.y) * (1 - this.damping);
            this.vel.z = (this.points[i].pos.z - this.points[i].prev.z) * (1 - this.damping);
            this.acc.set(0, 0, 0);

            // Left
            Vec3.subtract(this.dirLeft, this.points[i - 1].pos, this.pos);
            const leftLength = this.dirLeft?.length() + 1e-8;
            this.acc.x += (this.dirLeft.x / leftLength) * ((leftLength - this.rest[i - 1]) * this.stiffness);
            this.acc.y += (this.dirLeft.y / leftLength) * ((leftLength - this.rest[i - 1]) * this.stiffness);
            this.acc.z += (this.dirLeft.z / leftLength) * ((leftLength - this.rest[i - 1]) * this.stiffness);

            // Right
            Vec3.subtract(this.dirRight, this.points[i + 1].pos, this.pos);
            const rightLength = this.dirRight?.length() + 1e-8;
            this.acc.x += (this.dirRight.x / rightLength) * ((rightLength - this.rest[i]) * this.stiffness);
            this.acc.y += (this.dirRight.y / rightLength) * ((rightLength - this.rest[i]) * this.stiffness);
            this.acc.z += (this.dirRight.z / rightLength) * ((rightLength - this.rest[i]) * this.stiffness);

            this.newPos.x = this.pos.x + this.vel.x + this.acc.x * (dt * dt);
            this.newPos.y = this.pos.y + this.vel.y + this.acc.y * (dt * dt);
            this.newPos.z = this.pos.z + this.vel.z + this.acc.z * (dt * dt);

            this.points[i].prev.set(this.pos.x, this.pos.y, this.pos.z); // save the previous position
            this.points[i].pos.set(this.newPos.x, this.newPos.y, this.newPos.z); // update the position
        }
    }


    private baseDir: Vec3 = new Vec3();
    private injection: Vec3 = new Vec3();
    private dv: Vec3 = new Vec3();
    private seg = new Vec3();
    private nSeg = new Vec3();
    private v = new Vec3();

    private injectEndpointImpulse(endVel: Vec3, atStart: boolean) {
        if (this.waveGain <= 0) return;
        if (endVel.lengthSqr() < 1e-12) return;

        const idxEnd = atStart ? 0 : this.pointCount - 1;
        let step = atStart ? 1 : -1;

        if (atStart) {
            this.baseDir.set(this.points[1].pos.x - this.points[0].pos.x, this.points[1].pos.y - this.points[0].pos.y, this.points[1].pos.z - this.points[0].pos.z);
        }
        else {
            this.baseDir.set
                (
                    this.points[this.pointCount - 1].pos.x - this.points[this.pointCount - 2].pos.x,
                    this.points[this.pointCount - 1].pos.y - this.points[this.pointCount - 2].pos.y,
                    this.points[this.pointCount - 1].pos.z - this.points[this.pointCount - 2].pos.z
                );
        }

        Vec3.multiplyScalar(this.injection, endVel, this.waveGain);

        for (let k = 1; k <= this.injectNeighbors; k++) {
            const i = idxEnd + step * k
            if (i <= 0 || i >= this.pointCount - 1) break;

            const fall = Math.pow(this.injectFalloff, k - 1);
            Vec3.multiplyScalar(this.dv, this.injection, fall);

            if (this.injectPerpendicularOnly) {
                if (step > 0) {
                    this.seg.set(
                        this.points[i].pos.x - this.points[i - 1].pos.x,
                        this.points[i].pos.y - this.points[i - 1].pos.y,
                        this.points[i].pos.z - this.points[i - 1].pos.z
                    )
                }
                else {
                    this.seg.set(
                        this.points[i].pos.x - this.points[i + 1].pos.x,
                        this.points[i].pos.y - this.points[i + 1].pos.y,
                        this.points[i].pos.z - this.points[i + 1].pos.z
                    )
                }

                if (this.seg.lengthSqr() > 1e-12) {
                    Vec3.normalize(this.nSeg, this.seg);
                }
                else {
                    Vec3.normalize(this.nSeg, this.baseDir);
                }
                const dot = Vec3.dot(this.dv, this.nSeg);
                this.dv.x -= this.nSeg.x * dot;
                this.dv.y -= this.nSeg.y * dot;
                this.dv.z -= this.nSeg.z * dot;
            }

            if (this.injectPerStepClamp > 0) {
                const m = this.dv.length();
                if (m > this.injectPerStepClamp) {
                    Vec3.multiplyScalar(this.dv, this.dv, this.injectPerStepClamp / m);
                }
            }

            this.v.set
                (
                    this.points[i].pos.x - this.points[i].prev.x,
                    this.points[i].pos.y - this.points[i].prev.y,
                    this.points[i].pos.z - this.points[i].prev.z
                );
            this.v.x += this.dv.x;
            this.v.y += this.dv.y;
            this.v.z += this.dv.z;
            this.points[i].prev.set
                (
                    this.points[i].pos.x - this.v.x,
                    this.points[i].pos.y - this.v.y,
                    this.points[i].pos.z - this.v.z
                );
        }
    }

    private d = new Vec3();
    private corr = new Vec3();

    private applyLengthConstraints() {
        for (let i = 0; i < this.pointCount - 1; i++) {
            Vec3.subtract(this.d, this.points[i + 1].pos, this.points[i].pos);
            const len = this.d?.length() + 1e-8;
            const diff = len - this.rest[i];
            Vec3.multiplyScalar(this.corr, this.d, diff / len * this.lengthStiffness * 0.5);
            if (i != 0) Vec3.add(this.points[i].pos, this.points[i].pos, this.corr);
            if (i + 1 != this.pointCount - 1) Vec3.subtract(this.points[i + 1].pos, this.points[i + 1].pos, this.corr);
        }

    }

    private s = new Vec3();
    private e = new Vec3();
    private dirS = new Vec3();
    private dirE = new Vec3();

    updateRestIfEndpointsStretch(): void {
        for (let i = 0; i < this.rest?.length; i++) {
            this.rest[i] *= this.scaleRest;
        }
        this.startPoint?.getPosition(this.s);
        this.endPoint?.getPosition(this.e);
        Vec3.subtract(this.dirS, this.s, this.lastStart);
        Vec3.subtract(this.dirE, this.e, this.lastEnd);
        if (this.dirS.lengthSqr() > 1e-12 || this.dirE.lengthSqr() > 1e-12) {
            let total = 0;
            for (let i = 0; i < this.rest?.length; i++) {
                total += this.rest[i];
            }
            if (total < 1e-8) total = 1e-8;
            const newTotal = Vec3.distance(this.s, this.e);
            const scale = newTotal / total;
            for (let i = 0; i < this.rest?.length; i++) {
                this.rest[i] *= scale;
            }
            this.lastStart.set(this.s);
            this.lastEnd.set(this.e);
        }

    }

    private src: Vec3[] = []
    private smooth: Vec3[] = []
    private trimmed: Vec3[] = []
    updateLine(): void {
        // ensure src capacity and copy positions without allocating new Vec3s
        if (!this.lineRender || !this.lineRender.node || !this.lineRender.node.isValid) return;
        for (let i = this.src?.length; i < this.pointCount; i++) this.src.push(new Vec3());
        for (let i = 0; i < this.pointCount; i++) {
            this.src[i].set(this.points[i].pos);
        }


        // smooth sampling into preallocated buffer
        const smoothCount = sampleCatmullRomOpenOut(this.src, this.catmullSubdiv, this.smooth);
        if (this.smooth?.length) {
            this.lineRender.updateRenderPoints(this.smooth);
        }
        this.lineRender.setFill(this.fillAmount);
    }

    private applyFillOut(pts: Vec3[], count: number, t: number, fillDir: EFillDirection, outArr: Vec3[]): number {
        const t1 = clamp01(t);
        if (count < 2 || t1 <= 0) return 0;

        if (t1 >= 1) {
            // copy all in requested direction without new allocations
            if (fillDir === EFillDirection.StartToEnd) {
                for (let i = outArr?.length; i < count; i++) outArr.push(new Vec3());
                for (let i = 0; i < count; i++) outArr[i].set(pts[i]);
                return count;
            } else {
                for (let i = outArr?.length; i < count; i++) outArr.push(new Vec3());
                let w = 0;
                for (let i = count - 1; i >= 0; i--) outArr[w++].set(pts[i]);
                return count;
            }
        }

        // compute total length
        let total = 0;
        for (let i = 0; i < count - 1; i++) total += Vec3.distance(pts[i], pts[i + 1]);
        const target = total * t1;

        if (fillDir === EFillDirection.StartToEnd) {
            return this.clipForwardOut(pts, count, target, outArr);
        } else {
            return this.clipBackwardOut(pts, count, target, outArr);
        }
    }

    private clipForwardOut(pts: Vec3[], count: number, target: number, outArr: Vec3[]): number {
        if (outArr.length === 0) outArr.push(new Vec3());
        outArr[0].set(pts[0]);
        let outLen = 1;
        let acc = 0;
        for (let i = 0; i < count - 1; i++) {
            const seg = Vec3.distance(pts[i], pts[i + 1]);
            if (acc + seg >= target) {
                const remain = target - acc;
                const u = clamp01(seg > 1e-6 ? remain / seg : 0);
                if (outArr?.length <= outLen) outArr.push(new Vec3());
                Vec3.lerp(outArr[outLen++], pts[i], pts[i + 1], u);
                return outLen;
            }
            acc += seg;
            if (outArr?.length <= outLen) outArr.push(new Vec3());
            outArr[outLen++].set(pts[i + 1]);
        }
        // ensure at least two points
        if (outLen === 1) {
            if (outArr?.length <= outLen) outArr.push(new Vec3());
            outArr[outLen++].set(pts[count - 1]);
        }
        return outLen;
    }

    private clipBackwardOut(pts: Vec3[], count: number, target: number, outArr: Vec3[]): number {
        // start from end, accumulate backwards
        if (outArr?.length === 0) outArr.push(new Vec3());
        let outLen = 0;
        outArr[outLen++].set(pts[count - 1]);
        let acc = 0;
        for (let i = count - 1; i > 0; i--) {
            const seg = Vec3.distance(pts[i - 1], pts[i]);
            if (acc + seg >= target) {
                const remain = target - acc;
                const u = clamp01(seg > 1e-6 ? 1 - (remain / seg) : 1);
                if (outArr?.length <= outLen) outArr.push(new Vec3());
                Vec3.lerp(outArr[outLen++], pts[i - 1], pts[i], u);
                // reverse the array in-place (we filled backwards), but avoid allocations:
                for (let a = 0, b = outLen - 1; a < b; a++, b--) {
                    const ta = outArr[a];
                    const tb = outArr[b];
                    // swap values by temp Vec3
                    const tx = ta.x, ty = ta.y, tz = ta.z;
                    ta.set(tb);
                    tb.x = tx; tb.y = ty; tb.z = tz;
                }
                return outLen;
            }
            acc += seg;
            if (outArr?.length <= outLen) outArr.push(new Vec3());
            outArr[outLen++].set(pts[i - 1]);
        }
        // ensure at least two points
        if (outLen === 1) {
            if (outArr?.length <= outLen) outArr.push(new Vec3());
            outArr[outLen++].set(pts[0]);
        }
        // reverse filled sequence to maintain start->end order
        for (let a = 0, b = outLen - 1; a < b; a++, b--) {
            const ta = outArr[a];
            const tb = outArr[b];
            const tx = ta.x, ty = ta.y, tz = ta.z;
            ta.set(tb);
            tb.x = tx; tb.y = ty; tb.z = tz;
        }
        return outLen;
    }

    //#endregion

    private _tweenValue: { v: number } = { v: 0 }

    public async growAsync(duration: number): Promise<void> {
        Tween.stopAllByTarget(this._tweenValue);
        this.fillAmount = 0;
        this._tweenValue.v = 0;
        return new Promise<void>((resolve) => {
            tween(this._tweenValue)
                .to(duration, { v: 1 }, {
                    easing: easing.sineOut, onUpdate: () => {
                        this.fillAmount = this._tweenValue.v;
                    }, onComplete: () => {
                        resolve();
                    }
                })
                .start();
        });
    }

    public async shrinkAsync(duration: number): Promise<void> {
        Tween.stopAllByTarget(this._tweenValue);
        this.fillAmount = 2.0;
        this._tweenValue.v = 2.0;
        return new Promise<void>((resolve) => {
            tween(this._tweenValue)
                .to(duration, { v: 1.0001 }, {
                    easing: easing.sineOut, onUpdate: () => {
                        this.fillAmount = this._tweenValue.v;
                    }, onComplete: () => {
                        this.fillAmount = 0;
                        resolve();
                    }
                })
                .start();
        });
    }

    public setColor(color: Color) {
        const renderer = this.getComponent(MeshRenderer)
        // renderers.forEach(renderer => {
        const mat = renderer.getMaterialInstance(0);
        mat.setProperty("mainColor", color);
        mat.setProperty("shadowColor", color);
        // mat.setProperty("shadeColor1", this.darkenColor(this.color, 0.7));
        // mat.setProperty("shadeColor2", this.darkenColor(this.color, 0.9));
        // })
    }
}


