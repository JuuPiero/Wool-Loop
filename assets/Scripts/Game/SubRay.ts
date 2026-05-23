import { _decorator, BoxCollider, Color, Component, ITriggerEvent, log, Node, tween, Vec3, Quat, Collider } from 'cc';
import { Spline } from '../Spline';
import { SplineInstantiate } from '../SplineInstantiate';
import { SplineAnimate } from '../SplineAnimate';
import { RaySlot } from './RaySlot';
import { GameManager, GameState } from './GameManager';
import { ServiceLocator } from '../ServiceLocator';
import { SpoolManager } from './SpoolManager';
import { Barrier } from './Barrier';
import { ConveyorData } from './LevelDataSA';
import { PlayableColorConfig } from '../Data/ColorConfig';
import { SEGMENT_COUNT } from './Constants/Constants';
const { ccclass, property } = _decorator;

@ccclass('SubRay')
export class SubRay extends Component {

    @property(Spline)
    public spline: Spline;
    @property(SplineInstantiate) public splineInstantiate: SplineInstantiate;
    @property(BoxCollider) public rayTrigger: BoxCollider

    public gameManager: GameManager = null

    @property({
        type: RaySlot
    })
    public raySlots: RaySlot[] = []

    @property(Barrier) public barrier: Barrier = null

    @property public maxShow = 5

    private _closeBarrierCb = () => { this.barrier?.close(); };

    private _scheduleCloseBarrier() {
        this.unschedule(this._closeBarrierCb);
        this.scheduleOnce(this._closeBarrierCb, 0.4);
    }

    protected onLoad(): void {
        this.rayTrigger?.on('onTriggerStay', this.onTriggerEnter, this);
    }


    protected start(): void {
        this.gameManager = ServiceLocator.get(GameManager)

    }

    public init(data: ConveyorData, colorConfig: PlayableColorConfig) {
        const count = data.colorIds.length * SEGMENT_COUNT; // Lặp lại 10 lần cho đủ dài
        this.splineInstantiate.count = count;
        this.splineInstantiate.init();

        this.raySlots = [];
        this.splineInstantiate.items.forEach(item => {
            const slot = item.getComponent(RaySlot);
            this.raySlots.push(slot);
            item.getComponent(Collider).destroy();
        });

        const visibleCount = Math.min(this.maxShow * SEGMENT_COUNT, this.raySlots.length);

        for (let j = 0; j < data.colorIds.length; j++) {
            const colorId = data.colorIds[j];

            for (let k = 0; k < SEGMENT_COUNT; k++) {
                const slotIndex = j * SEGMENT_COUNT + k;
                if (slotIndex >= this.raySlots.length) break;

                const raySlot: RaySlot = this.raySlots[slotIndex];
                if (!raySlot.wool) continue;

                raySlot.wool.setColor(colorConfig.getMainColor(colorId));
                raySlot.wool.node.active = slotIndex < visibleCount;
            }
        }
    }

    protected onDestroy(): void {
        this.rayTrigger?.off('onTriggerStay', this.onTriggerEnter, this);
    }


    onTriggerEnter(event: ITriggerEvent) {
        if (this.gameManager.state != GameState.PLAY) return

        const raySlotTarget = event.otherCollider.getComponent(RaySlot);
        if (!raySlotTarget) return;
        if (raySlotTarget.wool) return;
        if (!this.raySlots.length) return;

        for (let i = 0; i < this.raySlots.length; i++) {
            const slot = this.raySlots[i];

            if (slot.wool) {
                this.barrier?.open();
                this.unschedule(this._closeBarrierCb);
                const wool = slot.wool;

                // 1. Lưu lại toạ độ thế giới thực tế lúc vừa chạm mép Collider
                const worldPos = wool.node.worldPosition.clone();
                const worldRot = wool.node.worldRotation.clone();

                // 2. Chuyển Parent sang tia chính
                wool.node.setParent(raySlotTarget.node);

                // 3. Ép giữ nguyên World Transform để không bị giật trong frame đầu tiên
                wool.node.setWorldPosition(worldPos);
                wool.node.setWorldRotation(worldRot);

                // 4. Dùng Tween "hút" nó khít vào tâm Slot trong 0.15 giây (rất mượt)
                tween(wool.node)
                    .to(0.15, {
                        position: Vec3.ZERO,
                        eulerAngles: Vec3.ZERO // Trả local rotation về 0,0,0
                    }, {
                        easing: "quadOut"
                    })
                    .start();

                raySlotTarget.wool = wool;
                slot.wool = null;

                ServiceLocator.get(SpoolManager).checkLose();

                this.shiftWools(i);
                this._scheduleCloseBarrier();
                return;
            }
        }
    }
    private shiftWools(startIndex: number) {
        const moveDuration = 0.4;

        for (let i = startIndex; i < this.raySlots.length - 1; i++) {
            const current = this.raySlots[i];
            const next = this.raySlots[i + 1];

            if (!next.wool) break;

            const wool = next.wool;
            next.wool = null;
            current.wool = wool;

            const sourceAnim = next.node.getComponent(SplineAnimate);
            const targetAnim = current.node.getComponent(SplineAnimate);

            if (!sourceAnim || !targetAnim) continue;

            // 1. LƯU & GIỮ NGUYÊN WORLD TRANSFORM
            const startWorldPos = wool.node.worldPosition.clone();
            const startWorldRot = wool.node.worldRotation.clone();

            wool.node.setParent(current.node);
            wool.node.setWorldPosition(startWorldPos);
            wool.node.setWorldRotation(startWorldRot);
            wool.node.active = true;

            // 2. TÍNH TOÁN KHOẢNG CÁCH (DISTANCE) - Đã sửa cho gọn
            const startDistance = sourceAnim.getDistance();
            let endDistance = targetAnim.getDistance();
            const totalLength = sourceAnim.getTotalLength();

            if (Math.abs(startDistance - endDistance) > totalLength / 2) {
                if (startDistance > endDistance) endDistance += totalLength;
                else endDistance -= totalLength;
            }

            const spline = (sourceAnim as any).spline;
            const samples = (sourceAnim as any).samples;

            const proxy = { distance: startDistance };

            // Bắt đầu tween ngay lập tức, không có delay
            tween(proxy)
                .to(moveDuration, { distance: endDistance }, {
                    easing: "quadOut", // Bạn có thể đổi thành "cubicOut" nếu muốn nó trượt gắt hơn
                    onUpdate: (target: any) => {
                        let d = target.distance;

                        if (d >= totalLength) d -= totalLength;
                        if (d < 0) d += totalLength;

                        // Cập nhật vị trí
                        const pos = spline.getPointAtDistance(samples, d);
                        wool.node.setWorldPosition(pos);

                        // Cập nhật góc quay
                        let nextDist = d + 0.1;
                        if (nextDist >= totalLength) {
                            nextDist -= totalLength;
                        }
                        const nextPos = spline.getPointAtDistance(samples, nextDist);

                        const dir = new Vec3();
                        Vec3.subtract(dir, nextPos, pos);

                        if (dir.lengthSqr() > 0.000001) {
                            dir.normalize();
                            const rot = new Quat();
                            Quat.fromViewUp(rot, dir);
                            wool.node.setWorldRotation(rot);
                        }
                    },
                    onComplete: () => {
                        // Ép chuẩn 100% vào tâm khi tới đích
                        wool.node.setPosition(Vec3.ZERO);
                        wool.node.setRotationFromEuler(Vec3.ZERO);

                    }
                })
                .start();
        }
    }




}
