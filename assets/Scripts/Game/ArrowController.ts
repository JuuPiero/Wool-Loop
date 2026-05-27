import { _decorator, Component, Node } from 'cc';
import { SplineInstantiate } from '../SplineInstantiate';
import { SplineAnimate } from '../SplineAnimate';
const { ccclass, property } = _decorator;

@ccclass('ArrowController')
export class ArrowController extends Component {

    @property(SplineInstantiate) public splineInstantiate: SplineInstantiate = null
    private distances: number[] = []; // Lưu khoảng cách tương đối giữa các item
    @property public speed: number = 5;


    protected start(): void {
         this.splineInstantiate.init();
        if (this.splineInstantiate) {
            this.calculateRelativeDistances();

            // if (this.autoMove) {
            // }
            this.startMoving();

        }
    }

    public startMoving(): void {
        if (!this.splineInstantiate) return;

        // this.isMoving = true;
        const items = this.splineInstantiate.getAllItems().map(item => item.getComponent(SplineAnimate));

        for (const item of items) {
            if (item && item.isValid) {
                item.startMoving();
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


     protected update(dt: number): void {
        // if (!this.isMoving) return;
        if (!this.splineInstantiate) return;

        // const currentSpeed = this.collectingCount > 0 ? this.speed * 0.6 : this.speed;
        const currentSpeed = this.speed;
        const items = this.splineInstantiate.getAllItems().map(item => item.getComponent(SplineAnimate));
        if (items.length === 0) return;

        // if (this.maintainFormation) {
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
        // }
    }

}


