import { _decorator, CCBoolean, CCInteger, Color, Component, instantiate, log, MeshRenderer, Node, Tween, tween, Vec2, Vec3 } from 'cc';
import { Clickable } from '../Clickable';
import { ServiceLocator } from '../ServiceLocator';
import { SpoolManager } from './SpoolManager';
import { Slot } from './Slot';
import { RaySlot } from './RaySlot';
import { RopeBezierWave3D } from '../../Deps/iKame/scripts/rope/RopeBezierWave3D';
import { GameConfig } from './GameConfigSA';
import { SoundManager } from '../SoundManager';
import { MatchZone } from './MatchZone';
import { WoolManager } from './WoolManager';
import { EventBus } from '../EventBus';
import { GameEvent } from '../GameEvent';
import { SplineAnimate } from '../SplineAnimate';
import { IGridItem } from './IGridItem';
import { GridSlotData } from './LevelDataSA';
import { PlayableColorConfig } from '../Data/ColorConfig';

const { ccclass, property } = _decorator;


@ccclass('Spool')
export class Spool extends Clickable implements IGridItem {
    @property(Vec2) position: Vec2;
    public getPositon() {
        return this.position;
    }

    public clickFunc: Function = null
    public onExitFunc: Function = null

    @property(CCInteger)
    public capacity: number = 0;

    @property(CCInteger)
    public count: number = 0;

    @property(CCBoolean)
    public isFlying: boolean = false;

    @property(Color)
    public color: Color;

    // public row: number = 0;
    // public col: number = 0;

    @property({ type: MeshRenderer })
    public renderers: MeshRenderer[] = [];

    public isInSlot: boolean = false;

    @property({ type: Node })
    public woolsView: Node[] = [];

    public isCollecting: boolean;

    @property(Node)
    public inActiveView: Node;

    public spoolManager: SpoolManager;

    @property(Slot)
    public slot: Slot = null;

    @property(RopeBezierWave3D)
    public rope: RopeBezierWave3D;

    public isOpen: boolean = false;
    public isSpawning: boolean = false;
    @property(Node) public shadow: Node = null
    protected onLoad(): void {
        // KHÔNG ghi đè nếu rope đã được gán (qua @property prefab hoặc đã set ở init).
        // Ghi đè vô điều kiện bằng getComponentInChildren dễ trả về null/sai trong vài
        // trạng thái lifecycle (node rope inactive / spool spawn detached) -> thi thoảng
        // rope không được set/init chuẩn.
        if (!this.rope) {
            this.rope = this.getComponentInChildren(RopeBezierWave3D);
        }
        this.spoolManager = ServiceLocator.get(SpoolManager);
        this.baseRotation = new Vec3(-90, 90, 90)
    }
    protected start(): void {
        this.isOpen = !this.isBlocked();
        if (this.isOpen) {
            this.open(false);
        }
        else {
            this.close();
        }
    }

    public init(data: GridSlotData, spoolManager: SpoolManager, onClick?: Function) {
        this.spoolManager = spoolManager;
        this.position = new Vec2(data.x, data.y);
        this.spoolManager.spools.push(this);
        this.spoolManager.spoolsMap.set(`${data.x}_${data.y}`, this);
        this.spoolManager.validSpoolPositions.add(`${data.x}_${data.y}`);
        this.capacity = 20;
        this.count = 0;
        this.node.name = `Spool_(${data.x}, ${data.y})`;
        this.clickFunc = onClick;
        if (!this.rope) {
            this.rope = this.getComponentInChildren(RopeBezierWave3D)!;
        }
        this.setColor(data.colorId);
    }

    public setColor(colorId: number) {
        const colorConfig = ServiceLocator.get(PlayableColorConfig);
        this.color = colorConfig.getMainColor(colorId) || Color.WHITE;

        if (!this.rope) {
            this.rope = this.getComponentInChildren(RopeBezierWave3D) || null;
        }

        if (this.rope) {
            this.rope.setColor(this.color);
            const mat = this.rope.getComponent(MeshRenderer).getMaterialInstance(0);
            if (mat) {
                mat.setProperty('fill', 0);
            }
        }

        for (const renderer of this.renderers) {
            if (!renderer) continue;
            const mat = renderer.getMaterialInstance(0);
            if (mat) {
                mat.setProperty('color', this.color);
            }
        }
    }

    public isFull() {
        return this.count === this.capacity;
    }


    private tempVec3: Vec3 = new Vec3()
    private wiggleTween: Tween<Node> | null = null;
    private ropePositionTween: Tween<{ value: number }> | null = null;
    private baseRotation: Vec3 = new Vec3();

    startWiggle() {
        this.wiggleTween?.stop();

        const left = this.baseRotation.clone().add3f(0, -10, 0);
        const right = this.baseRotation.clone().add3f(0, 10, 0);

        this.wiggleTween = tween(this.node)
            .repeatForever(
                tween()
                    .to(0.2, { eulerAngles: left })
                    .to(0.2, { eulerAngles: right })
            )
            .start();
    }

    stopWiggle() {
        this.wiggleTween?.stop();
        this.wiggleTween = null;

        tween(this.node)
            .to(0.1, { eulerAngles: new Vec3(-90, 90, 90) }) // reset về base
            .start();
    }

    public collectedDone() {
        this.queue = []
        this.isFlying = true;
        SoundManager.instance.playOneShot('Success');

        Tween.stopAllByTarget(this.node);

        const ropeMat = this.rope.getComponent(MeshRenderer).getMaterialInstance(0);
        Tween.stopAllByTarget(this.ropeFillTweenState);
        this.ropeFillTweenState.value = 0;
        ropeMat.setProperty('fill', 0);

        const effect = instantiate(ServiceLocator.get(GameConfig).completedEffect);
        effect.setParent(this.node);

        const startPos = this.node.position.clone();
        const flyPos = new Vec3(startPos.x, startPos.y + 5, startPos.z);

        tween(this.node)
            .parallel(
                tween().to(0.28, { position: flyPos }, { easing: "quadOut" }),
                tween(this.node).to(0.28, { eulerAngles: new Vec3(0, 0, 540) }, { easing: "quadOut" })
            )
            .to(0.14, { scale: Vec3.ZERO }, { easing: "backIn" })
            .call(() => this.finishSpool())
            .start();

    }

    private finishSpool() {
        this.queue.forEach(item => {
            item.canCollect = true
            item.isCollecting = false

        })
        this.queue = []

        this.node.active = false;
        this.slot.labelProcess.node.active = false;
        this.slot.setProcess(0);
        this.spoolManager.remove(this);
        this.slot.spool = null;

        EventBus.emit(GameEvent.COLLECT_DONE)
    }

    protected onDestroy(): void {
        this.rope.node.active = false;
    }
    static delay = false

    public onClick() {
        this.clickFunc?.()
    }

    // private bouceTween: Tween<Node> | null = null;
    private isBocuncePlaying: boolean = false;
    public playClickBounce(onDone?: Function, onStart?: Function) {
        if (this.isBocuncePlaying) return;
        const baseScale = this.node.scale.clone();
        // if (baseScale.x === 0 && baseScale.y === 0 && baseScale.z === 0) {
        //     onDone?.();
        //     return;
        // }
        const basePosition = this.node.position.clone();
        this.isBocuncePlaying = true;
        onStart?.();
        // Squash & stretch: lún xuống ở trục giữa, nở nhẹ 2 bên.
        const squashScale = new Vec3(baseScale.x * 1.13, baseScale.y * 0.82, baseScale.z * 1.13);
        const squashPosition = new Vec3(basePosition.x, basePosition.y - 0.11, basePosition.z);
        const reboundScale = new Vec3(baseScale.x * 0.97, baseScale.y * 1.06, baseScale.z * 0.97);

        tween(this.node)
            .to(0.06, {
                scale: squashScale,
                position: squashPosition,
            }, { easing: 'quadOut' })
            .to(0.08, {
                scale: reboundScale,
                position: basePosition,
            }, { easing: 'quadInOut' })
            .to(0.1, {
                scale: baseScale,
                position: basePosition,
            }, { easing: 'backOut' })
            .call(() => {
                this.isBocuncePlaying = false;
                onDone?.()
            })
        .start();
        // this.bouceTween?.start();
    }

    public activateNextSpools() {
        // position.x = col, position.y = row
        const right = this.spoolManager.getSpool(this.position.x + 1, this.position.y);
        if (right && !right.isOpen) {
            right.isOpen = true;
            right.open();
        }
        const left = this.spoolManager.getSpool(this.position.x - 1, this.position.y);
        if (left && !left.isOpen) {
            left.isOpen = true;
            left.open();
        }
        const down = this.spoolManager.getSpool(this.position.x, this.position.y - 1);
        if (down && !down.isOpen) {
            down.isOpen = true;
            down.open();
        }
    }

    public moveToSlot(slot: Slot, onDone?: Function) {
        this.isFlying = true;
        this.isInSlot = true;
        slot.setProcess(0);
        slot.labelProcess.node.active = true;

        const targetPos = slot.placePos.worldPosition.clone();
        // targetPos.y = this.node.y;
        const localTarget = new Vec3();
        this.node.parent!.inverseTransformPoint(localTarget, targetPos);

        const startPos = this.node.position.clone();
        const baseScale = this.node.scale.clone();
        const moveDuration = 0.4;
        const jumpHeight = 10;
        const progress = { value: 0 };

        Tween.stopAllByTarget(this.node);
        // this.node.eulerAngles = new Vec3(-90, 90, 90);

        tween(this.node).to(0.4, {
            eulerAngles: new Vec3(-90, 90, 90)
        }).start();

        tween(progress)
            .to(moveDuration, { value: 1 }, {
                easing: "quadOut",
                onUpdate: () => {
                    const p = progress.value;
                    Vec3.lerp(this.tempVec3, startPos, localTarget, p);

                    // Arc jump path.
                    this.tempVec3.y += Math.sin(p * Math.PI) * jumpHeight;
                    this.node.setPosition(this.tempVec3);

                    // Squash/stretch: squash at takeoff/landing, stretch in mid-air.
                    const airborne = Math.sin(p * Math.PI);
                    const edge = 1 - airborne;
                    const scaleYFactor = 1 + airborne * 0.14 - edge * 0.09;
                    const scaleXZFactor = 1 - airborne * 0.06 + edge * 0.11;

                    this.node.setScale(
                        baseScale.x * scaleXZFactor,
                        baseScale.y * scaleYFactor,
                        baseScale.z * scaleXZFactor
                    );
                }
            })

            .call(() => {
                this.node.setPosition(localTarget);
                this.node.setScale(baseScale);
                // this.node.eulerAngles = new Vec3(-90, 90, 90);
            })
            .call(() => {
                this.syncWoolsView()
                this.isFlying = false
                this.slot = slot
                slot.setSpool(this)
                this.enqueueWoolsInZone();

                this.collects()
                Spool.delay = false
                onDone?.()
                const exitDone = (replacementSpool?: Spool) => {
                    if (!replacementSpool && this.isOpen) {
                        this.activateNextSpools();
                    }
                };
                if (this.onExitFunc) {
                    this.onExitFunc(exitDone);
                } else {
                    exitDone();
                }
                // Emit event khi spool move to slot (thay vì gọi onExit callback)
            })
            .start();
    }

    // Gom TẤT CẢ wool cùng màu đang nằm trong vùng match (quét hình học) vào queue
    // ngay khi spool vào slot. Nhờ đầy đủ từ đầu nên collects() sort theo distance
    // nhặt đúng cục ở đầu line, không bị nhặt cục giữa rồi giật ngược về đầu khi
    // cục đầu thật mới được đăng ký vào queue muộn.
    public enqueueWoolsInZone() {
        const matchZone = ServiceLocator.get(MatchZone);
        const inZone = matchZone.getMatchingWoolsInZone(this.color);
        for (const raySlot of inZone) {
            if (this.isFull()) break;
            if (raySlot.isCollecting) continue;
            if (this.queue.indexOf(raySlot) !== -1) continue;
            raySlot.isCollecting = true;
            this.queue.push(raySlot);
            matchZone.itemsInMatchZone.delete(raySlot);
        }
        // [DEBUG] Xóa khi xong.
        // console.log(
        //     `[Spool ${this.node.name}] enqueueWoolsInZone | gom được ${this.queue.length} cục` +
        //     ` | dists=[${this.queue.map(q => q.splineItem?.getDistance().toFixed(1)).join(', ')}]`
        // );
    }

    public placeInSlot(slot: Slot, onDone?: Function) {
        this.isFlying = false;
        this.isInSlot = true;
        slot.setProcess(0);
        slot.labelProcess.node.active = true;

        Tween.stopAllByTarget(this.node);
        this.node.setWorldPosition(slot.placePos.worldPosition);
        this.node.eulerAngles = new Vec3(-90, 90, 90);

        this.syncWoolsView();
        this.slot = slot;
        slot.setSpool(this);


        this.collects();
        Spool.delay = false;
        onDone?.();

        const exitDone = (replacementSpool?: Spool) => {
            if (!replacementSpool && this.isOpen) {
                this.activateNextSpools();
            }
        };
        if (this.onExitFunc) {
            this.onExitFunc(exitDone);
            // this.enqueueWoolsInZone();
        } else {
            exitDone();
            // this.enqueueWoolsInZone();

        }
    }

    @property(RaySlot)
    public queue: RaySlot[] = [];
    private flipScaleDirection: boolean = false;
    private fullScalePulsePlayed: boolean[] = [];
    private ropeFillTweenState: { value: number } = { value: 0 };

    @property public collectDelay = 0.05

    private getRopeEndTargetByCount(count: number): Vec3 {
        if (!this.woolsView.length || this.capacity <= 0) {
            return this.rope.endPoint.worldPosition.clone();
        }

        const capacityPerItem = this.capacity / this.woolsView.length;
        if (capacityPerItem <= 0) {
            return this.rope.endPoint.worldPosition.clone();
        }

        const slotIndex = Math.max(0, Math.min(
            this.woolsView.length - 1,
            Math.floor((Math.max(1, count) - 1) / capacityPerItem)
        ));

        return this.woolsView[slotIndex].worldPosition.clone();
    }

    private animateRopeFill(mat: any, to: number, duration: number): Promise<void> {
        Tween.stopAllByTarget(this.ropeFillTweenState);
        return new Promise<void>((resolve) => {
            tween(this.ropeFillTweenState)
                .to(duration, { value: to }, {
                    easing: 'quadInOut',
                    onUpdate: () => {
                        mat.setProperty('fill', this.ropeFillTweenState.value);
                    }
                })
                .call(() => {
                    mat.setProperty('fill', to);
                    resolve();
                })
                .start();
        });
    }

    // Sort queue theo ĐÚNG THỨ TỰ dọc băng chuyền dựa vào vị trí thật trên spline
    // (getDistance) — KHÔNG dùng world X (sai khi line cong) và KHÔNG dùng
    // RaySlot.index (index không hề được gán nên vô tác dụng).
    //
    // Xử lý WRAP: cụm cục trong zone là 1 cung liền mạch, nhưng nếu zone vắt qua
    // điểm nối vòng của spline thì distance vừa gần 0 vừa gần totalLength -> sort
    // thường bị scramble (nhặt cục giữa trước rồi giật). Nên nếu phát hiện cụm
    // vắt mối nối (max - min > L/2) thì coi cục distance lớn là (distance - L) để
    // nối liền với cục gần 0.
    //
    // distance (đã bù wrap) nhỏ = "đầu" (sắp ra khỏi zone) -> thu trước.
    // Nếu thấy ngược chiều thì đổi dấu cuối: return kb - ka.
    private sortQueueByLineOrder() {
        if (this.queue.length <= 1) return;

        let L = 0;
        const dists: number[] = [];
        for (const item of this.queue) {
            if (item?.wool && item.splineItem) {
                const d = item.splineItem.getDistance();
                dists.push(d);
                if (L === 0) L = item.splineItem.getTotalLength();
            }
        }
        if (dists.length <= 1 || L <= 0) {
            this.queue.sort((a, b) => {
                const ad = a?.wool && a.splineItem ? a.splineItem.getDistance() : Infinity;
                const bd = b?.wool && b.splineItem ? b.splineItem.getDistance() : Infinity;
                return ad - bd;
            });
            return;
        }

        const min = Math.min(...dists);
        const max = Math.max(...dists);
        const wraps = (max - min) > L / 2;

        const key = (item: RaySlot): number => {
            if (!item?.wool || !item.splineItem) return Infinity;
            let d = item.splineItem.getDistance();
            if (wraps && d > L / 2) d -= L;
            return d;
        };

        this.queue.sort((a, b) => key(a) - key(b));
    }

    public async collects() {
        if (this.isCollecting) return;
        this.isCollecting = true;
        this.queue = this.queue.filter(item => !!item?.wool);

        const mat = this.rope.getComponent(MeshRenderer).getMaterialInstance(0);
        if (this.queue.length === 0) {
            Tween.stopAllByTarget(this.ropeFillTweenState);
            this.ropeFillTweenState.value = 0;
            mat.setProperty('fill', 0);
            this.rope.node.active = false;

            this.isCollecting = false;
            ServiceLocator.get(WoolManager).setCollecting(false);
            ServiceLocator.get(SpoolManager).checkLose();
            return;
        }

        this.rope.node.active = true;
        this.ropeFillTweenState.value = 0;
        mat.setProperty('fill', 0);

        const woolManager = ServiceLocator.get(WoolManager);
        woolManager.setCollecting(true);

        // KHÔNG prime/fill TRƯỚC vòng lặp nữa. Trước đây prime vẽ dây tới wool "đầu"
        // rồi await fill 0.14s; trong 0.14s đó wool mới trôi vào zone chen vào queue
        // làm item thu đầu thật sự đổi -> dây bị vẽ tới wool ở giữa rồi giật về wool
        // đầu. Giờ chọn wool đầu NGAY trong loop (vị trí tươi), set dây đúng nó, và
        // cho fill chạy SONG SONG với lượt thu đầu -> không lệch, đúng thứ tự.
        let firstStep = true;
        while (this.queue.length > 0 && !this.isFull()) {
            this.sortQueueByLineOrder();
            const item = this.queue.shift();
            if (!item || !item.wool) continue;

            if (this.isFull()) {
                this.queue.unshift(item);
                break;
            }

            // 2. TÍNH TOÁN TỐC ĐỘ THU DÂY LINH HOẠT
            // Nếu speed = 5, delay ~ 0.12s. Nếu speed = 12, delay ~ 0.05s
            const dynamicDelay = Math.max(0.04, 0.6 / woolManager.speed);
            const animDuration = dynamicDelay * 1.5; // Animation dài hơn delay một chút để gối đầu nhau
            const ropeAnimDuration = Math.max(animDuration * 1.5, 0.12); // Slow down rope movement independently

            this.count++;
            this.syncWoolsView();
            item.isCollecting = true;

            const start = item.wool.startPoint.worldPosition.clone();
            const end = item.wool.endPoint.worldPosition.clone();

            // Bước đầu: đặt dây đúng wool thu đầu (vị trí hiện tại nên prev = pos,
            // vận tốc = 0 -> không giật), bật fill chạy song song và bắt đầu wiggle.
            if (firstStep) {
                // [DEBUG] In ra để chẩn đoán thứ tự thu. Xóa khi xong.
                const L = item.splineItem ? item.splineItem.getTotalLength() : 0;
                // console.log(
                //     `[Spool ${this.node.name}] start collect | queueLen(còn lại)=${this.queue.length}` +
                //     ` | totalLen=${L.toFixed(1)} | pick dist=${item.splineItem?.getDistance().toFixed(1)}` +
                //     ` | còn lại dists=[${this.queue.map(q => q.splineItem?.getDistance().toFixed(1)).join(', ')}]`
                // );

                this.rope.startPoint.setWorldPosition(start);
                this.rope.endPoint.setWorldPosition(this.getRopeEndTargetByCount(this.count));
                // this.rope.initIfNeeded(true);
                this.animateRopeFill(mat, 1, 0.14);
                this.startWiggle();
                firstStep = false;
            }
            // --- LOGIC SO LE ---
            // Tính toán độ lệch (offset) sang hai bên
            this.flipScaleDirection = !this.flipScaleDirection;
            const sideOffset = this.flipScaleDirection ? 0.5 : -0.5; // Điều chỉnh con số này để lệch nhiều hay ít

            // Điểm đích ảo để Wool bay tới (hơi lệch so với End thật của dây)
            const woolTargetPos = end.clone().add3f(sideOffset, 0, 0);

            // 3. CHẠY ANIMATION NHANH THEO TỐC ĐỘ GAME
            tween(item.wool.visual)
                .to(animDuration, {
                    worldPosition: woolTargetPos,
                    scale: Vec3.ZERO,
                    eulerAngles: new Vec3(0, this.flipScaleDirection ? 180 : -180, 0)
                }, { easing: 'quadIn' })
                .start();

            const ropeEndStart = this.rope.endPoint.worldPosition.clone();
            const ropeEndTarget = this.getRopeEndTargetByCount(this.count);
            const ropeEndLerp = new Vec3();

            this.ropePositionTween?.stop();
            let t = { value: 0 };
            this.ropePositionTween = tween(t)
                .to(ropeAnimDuration, { value: 1 }, {
                    easing: "quadOut",
                    onUpdate: () => {
                        Vec3.lerp(this.tempVec3, start, woolTargetPos, t.value);
                        this.rope.startPoint.setWorldPosition(this.tempVec3);

                        Vec3.lerp(ropeEndLerp, ropeEndStart, ropeEndTarget, t.value);
                        this.rope.endPoint.setWorldPosition(ropeEndLerp);
                    }
                })
                .start();

            // Đợi theo delay đã tính toán (nhanh hơn animation một chút để tạo độ gối đầu)
            await this.delay(dynamicDelay);

            if (item.wool) {
                item.wool.node.active = false;
                item.wool.node.destroy();
                item.wool = null;
            }

            item.isCollecting = false;
        }

        this.stopWiggle();
        await this.animateRopeFill(mat, 0, 0.24);
        this.isCollecting = false;
        woolManager.setCollecting(false); // Thông báo kết thúc thu dây

        if (this.isFull()) {
            this.releaseRemainingQueue();
            this.collectedDone();
            return;
        }

        ServiceLocator.get(SpoolManager).checkLose();

        if (this.queue.length > 0) {
            const matchZone = ServiceLocator.get(MatchZone);

            // Sort queue để nhả theo thứ tự hợp lý
            this.queue.sort((a, b) => b.index - a.index);



            while (this.queue.length > 0) {
                const item = this.queue.shift(); // Lấy từ đầu queue (index cao nhất)
                if (item) {
                    item.isCollecting = false; // BẮT BUỘC
                    item.canCollect = true;    // BẮT BUỘC
                    matchZone.itemsInMatchZone.add(item);
                }
            }
            this.queue = [];
            matchZone.checkExistingItems();
        }
    }

    delay(time: number) { return new Promise(resolve => { this.scheduleOnce(resolve, time); }); }

    public syncWoolsView() {
        if (!this.node || !this.woolsView.length || this.capacity <= 0) return;

        if (this.fullScalePulsePlayed.length !== this.woolsView.length) {
            this.fullScalePulsePlayed = new Array(this.woolsView.length).fill(false);
        }

        const capacityPerItem = this.capacity / this.woolsView.length;
        if (capacityPerItem <= 0) return; // Tránh division by zero

        for (let i = 0; i < this.woolsView.length; i++) {
            const item = this.woolsView[i];
            const filled = this.count - i * capacityPerItem;
            const ratio = Math.max(0, Math.min(1, filled / capacityPerItem));

            item.active = ratio > 0;
            if (item.active) {
                if (ratio >= 1) {
                    if (!this.fullScalePulsePlayed[i]) {
                        this.fullScalePulsePlayed[i] = true;
                        Tween.stopAllByTarget(item);
                        item.setScale(1, 1, 1);

                        const currentEuler = item.eulerAngles.clone();
                        tween(item)
                            .to(0.2, {
                                scale: new Vec3(1.3, 1.3, 1.3),
                                eulerAngles: new Vec3(currentEuler.x, currentEuler.y + 180, currentEuler.z)
                            }, { easing: 'quadOut' })
                            .to(0.2, {
                                scale: new Vec3(1, 1, 1),
                                eulerAngles: new Vec3(currentEuler.x, currentEuler.y + 360, currentEuler.z)
                            }, { easing: 'backOut' })
                            .start();
                    }
                } else {
                    this.fullScalePulsePlayed[i] = false;
                    Tween.stopAllByTarget(item);
                    item.setScale(ratio, ratio, ratio);
                }
            } else {
                this.fullScalePulsePlayed[i] = false;
                Tween.stopAllByTarget(item);
                item.setScale(Vec3.ZERO);
            }
        }

        if (this.slot) {
            this.slot.setProcess(Math.round(this.count / this.capacity * 100));
        }
    }

    private releaseRemainingQueue() {
        if (this.queue.length === 0) return;

        const matchZone = ServiceLocator.get(MatchZone);
        this.queue.sort((a, b) => b.index - a.index);

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (item) {
                item.isCollecting = false;
                item.canCollect = true;
                matchZone.itemsInMatchZone.add(item);
            }
        }
        this.queue = [];

        matchZone.checkExistingItems();
    }

    public open(playAnim: boolean = true) {
        if (this.isInSlot) return;
        this.setRendererActive(true);
        this.woolsView.forEach(item => item.active = false);
        if (playAnim) {
            this.playClickBounce();
        }
    }

    public close() {
        this.setRendererActive(false);
        this.inActiveView.active = true;
    }

    public setRendererActive(active: boolean) {
        this.renderers.forEach(renderer => {
            renderer.node.active = active;
            const mat = renderer.getMaterialInstance(0);
            // mat.setProperty("_Color", this.color);
            mat.setProperty("color", this.color);
            if (active) {
                mat.setProperty('lineWidth', 40);
            } else {
                mat.setProperty('lineWidth', 40);
                // mat.setProperty('lineWidth', 0);
            }
        });
    }

    public insertSorted(raySlot: RaySlot) {
        raySlot.isCollecting = true;
        // Chèn sao cho mảng queue luôn tăng dần theo index
        const index = this.queue.findIndex(q => raySlot.index > q.index);
        if (index === -1) this.queue.push(raySlot);
        else this.queue.splice(index, 0, raySlot);
    }

    public isBlocked(): boolean {
        if (!this.spoolManager) return true;
        // Chỉ unblock nếu ở hàng trên cùng (maxRow)
        // Các hàng dưới sẽ bị chặn từ trên
        return this.position.y < this.spoolManager.getMaxRow();
    }
}
