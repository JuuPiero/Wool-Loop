import { _decorator, Color, Component, log, math, RealCurve } from 'cc';
import { ServiceLocator } from '../ServiceLocator';
import { SpoolManager } from './SpoolManager';
import { SplineInstantiate } from '../SplineInstantiate';
import { SubRay } from './SubRay';
import { RaySlot } from './RaySlot';
import { SplineAnimate } from '../SplineAnimate';
import { GameManager } from './GameManager';
import { Spool } from './Spool';
import { EventBus } from '../EventBus';
import { GameEvent } from '../GameEvent';
import { NewLevelData } from './NewLevelDataSA';
import { LevelData } from './LevelDataSA';
import { PlayableColorConfig } from '../Data/ColorConfig';
const { ccclass, property } = _decorator;

@ccclass('WoolManager')
export class WoolManager extends Component {

    @property({ type: SplineInstantiate, tooltip: "Reference đến SplineInstantiate" })
    public splineInstantiate: SplineInstantiate = null!;

    @property({})
    public speed: number = 5;

    @property({ tooltip: "Tự động di chuyển khi start" })
    public autoMove: boolean = true;

    @property({ tooltip: "Giữ khoảng cách tương đối như lúc spawn" })
    public maintainFormation: boolean = true;

    private isMoving: boolean = false;
    private distances: number[] = []; // Lưu khoảng cách tương đối giữa các item

    @property({ type: SubRay })
    public subRays: SubRay[] = []
    @property({ type: RaySlot })
    public slots: RaySlot[] = []

    protected onLoad(): void {
        ServiceLocator.register(WoolManager, this)
        if (!this.splineInstantiate) {
            this.splineInstantiate = this.node.getComponent(SplineInstantiate);
        }
    }
    protected start(): void {
        this.subRays = this.getComponentsInChildren(SubRay)
    }

    protected onEnable(): void {
        EventBus.on(GameEvent.COLLECT_DONE, this.onCollectDone)
    }
    protected onDisable(): void {
        EventBus.off(GameEvent.COLLECT_DONE, this.onCollectDone)
    }


    onCollectDone = () => {
        const speedMultiplier: number = 1.025;
        // Tăng tốc độ theo phần trăm mỗi khi hoàn thành 1 spool
        // Công thức: Tốc độ mới = Tốc độ cũ * 1.1 (hoặc tùy biến)
        const newSpeed = this.speed * speedMultiplier;

        // giới hạn tốc độ tối đa để tránh lỗi vật lý hoặc giật lag
        const MAX_SPEED = 12;
        this.speed = Math.min(newSpeed, MAX_SPEED);

        console.log(`Speed increased to: ${this.speed.toFixed(2)}`);
    }

    private shuffleArray<T>(array: T[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    @property(RealCurve) public diffCurve: RealCurve = new RealCurve()

    public init(newLevelData: LevelData, colorConfig: PlayableColorConfig) {


        this.slots = [];

        const mainSplineItems = newLevelData.mainConveyor.colorIds;
        const repeatCount = 10;

        const mainConveyorCount = repeatCount * newLevelData.mainConveyor.colorIds.length;
        this.splineInstantiate.count = mainConveyorCount;
        this.splineInstantiate.init();

        // MAIN CONVEYOR
        for (let i = 0; i < mainSplineItems.length; i++) {

            const colorId = mainSplineItems[i];

            for (let k = 0; k < repeatCount; k++) {

                const slotIndex = i * repeatCount + k;

                if (slotIndex >= this.splineInstantiate.items.length) break;

                const raySlot = this.splineInstantiate.items[slotIndex].getComponent(RaySlot);

                this.slots.push(raySlot);

                raySlot.wool.setColor(
                    colorConfig.getMainColor(colorId)
                );
            }
        }

        // SUB CONVEYORS
        const subRaysData = newLevelData.conveyors;

        for (let i = 0; i < subRaysData.length; i++) {
            const subRay = this.subRays[i];
            const subRayData = subRaysData[i];
            subRay.init(subRayData, colorConfig);

            // for (let j = 0; j < subRayData.colorIds.length; j++) {

            //     const colorId = subRayData.colorIds[j];

            //     for (let k = 0; k < repeatCount; k++) {

            //         const slotIndex = j * repeatCount + k;

            //         if (slotIndex >= subRay.raySlots.length) break;

            //         const raySlot: RaySlot = subRay.raySlots[slotIndex];

            //         raySlot.wool.setColor(
            //             colorConfig.getMainColor(colorId)
            //         );
            //     }
            // }
        }

        if (this.splineInstantiate) {
            this.calculateRelativeDistances();

            if (this.autoMove) {
                this.startMoving();
            }
        }
    }

    private collectingCount: number = 0;

    public setCollecting(isCollecting: boolean) {
        if (isCollecting) this.collectingCount++;
        else this.collectingCount = Math.max(0, this.collectingCount - 1);
    }
    protected update(dt: number): void {
        if (!this.isMoving) return;
        if (!this.splineInstantiate) return;

        // const currentSpeed = this.collectingCount > 0 ? this.speed * 0.6 : this.speed;
        const currentSpeed = this.speed;
        const items = this.splineInstantiate.getAllItems().map(item => item.getComponent(SplineAnimate));
        if (items.length === 0) return;

        if (this.maintainFormation) {
            const leadItem = items[0];
            if (leadItem && leadItem.isValid) {
                const splineAnimate = leadItem

                const currentDist = splineAnimate.getDistance();
                // let newDist = currentDist - this.speed * dt;
                let newDist = currentDist - currentSpeed * dt;

                const totalLength = splineAnimate.getTotalLength();
                if (newDist < 0) {
                    newDist += totalLength;
                }

                splineAnimate.setDistance(newDist);

                for (let i = 1; i < items.length; i++) {
                    const item = items[i];
                    if (item && item.isValid) {
                        let targetDistance = splineAnimate.getDistance() - this.distances[i];
                        if (targetDistance < 0) {
                            targetDistance += totalLength;
                        }
                        item.setDistance(targetDistance);
                    }
                }
            }
        }
    }

    private calculateRelativeDistances(): void {
        if (!this.splineInstantiate) return;

        const items = this.splineInstantiate.getAllItems().map(item => item.getComponent(SplineAnimate));
        if (items.length === 0) return;

        this.distances = [];
        const leadDistance = items[0].getDistance();

        for (let i = 0; i < items.length; i++) {
            const splineAnimate = items[i]
            let relativeDistance = splineAnimate.getDistance() - leadDistance;
            if (relativeDistance < 0) {
                relativeDistance += splineAnimate.getTotalLength();
            }
            this.distances.push(relativeDistance);
        }
    }

    public updateFormation(): void {
        if (this.maintainFormation && this.splineInstantiate) {
            this.calculateRelativeDistances();

            if (this.isMoving) {
                const items = this.splineInstantiate.getAllItems().map(item => item.getComponent(SplineAnimate));
                for (const item of items) {
                    if (item && item.isValid && !item.isMovingNow()) {
                        item.startMoving();
                    }
                }
            }
        }
    }

    public recalculateDistances(): void {
        this.calculateRelativeDistances();
    }

    public startMoving(): void {
        if (!this.splineInstantiate) return;

        this.isMoving = true;
        const items = this.splineInstantiate.getAllItems().map(item => item.getComponent(SplineAnimate));

        if (this.maintainFormation) {
            if (items.length > 0 && items[0]) {
                items[0].startMoving();
            }
        } else {
            for (const item of items) {
                if (item && item.isValid) {
                    item.startMoving();
                }
            }
        }
    }

    public stopMoving(): void {
        if (!this.splineInstantiate) return;

        this.isMoving = false;
        const items = this.splineInstantiate.getAllItems().map(item => item.getComponent(SplineAnimate));

        for (const item of items) {
            if (item && item.isValid) {
                item.stopMoving();
            }
        }
    }

    /**
     * Reset tất cả về vị trí ban đầu
     */
    public reset(): void {
        if (!this.splineInstantiate) return;

        const items = this.splineInstantiate.getAllItems().map(item => item.getComponent(SplineAnimate));
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item && item.isValid) {
                const originalDistance = this.splineInstantiate.useUniformSpacing
                    ? (i / this.splineInstantiate.count + this.splineInstantiate.startOffset) % 1 * item.getTotalLength()
                    : 0;
                item.setDistance(originalDistance);
            }
        }
        this.calculateRelativeDistances();
    }

}