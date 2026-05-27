import { _decorator, Component, instantiate, Node, Prefab, Quat, utils, Vec3 } from 'cc';
import { Spline } from './Spline';
import { SplineAnimate } from './SplineAnimate';
const { ccclass, property } = _decorator;

@ccclass('SplineInstantiate')
export class SplineInstantiate extends Component {
    @property(Spline)
    public spline: Spline = null!;

    @property(Prefab)
    public itemToInstantiate: Prefab = null!;

    @property({ tooltip: "Số lượng object sẽ được instantiate dọc theo spline" })
    public count: number = 10;

    @property({ tooltip: "Offset từ điểm bắt đầu (0-1)" })
    public startOffset: number = 0;

    @property({ tooltip: "Khoảng cách đều nhau theo chiều dài spline thay vì theo t" })
    public useUniformSpacing: boolean = true;

    @property({ tooltip: "Số lượng samples để tính chiều dài spline" })
    public sampleCount: number = 100;

    @property({ type: Node, tooltip: "Parent node cho các object được instantiate (mặc định là scene root)" })
    public parentNode: Node = null!;

    @property(Node) public items: Node[] = [];

    protected start(): void {
        // Nếu không set parentNode, dùng scene root
        if (!this.parentNode) {
            this.parentNode = this.node.scene!;
        }

    }

    public init() {
        this.instantiateAlongSpline();
    }

    /**
     * Instantiate các object dọc theo spline
     */
    public instantiateAlongSpline(): void {
        if (!this.spline) {
            console.error("SplineInstantiate: spline is not assigned!");
            return;
        }

        if (!this.itemToInstantiate) {
            console.error("SplineInstantiate: itemToInstantiate is not assigned!");
            return;
        }

        if (this.count <= 0) {
            console.warn("SplineInstantiate: count must be greater than 0");
            return;
        }

        // Lấy samples để tính toán
        const samples = this.spline.getSamples(this.sampleCount);

        // Xây dựng bảng chiều dài nếu cần uniform spacing
        if (this.useUniformSpacing) {
            this.spline.buildLengthTable(samples);
        }

        // Instantiate các object
        for (let i = 0; i < this.count; i++) {
            let startDistance: number;

            if (this.useUniformSpacing) {
                // Tính toán vị trí dựa trên chiều dài đều nhau
                let t = (i / this.count + this.startOffset);
                if (t >= 1) t = t % 1;
                startDistance = t * this.spline.totalLength;
            } else {
                // Tính toán vị trí dựa trên tham số t đều nhau
                let t = i / this.count + this.startOffset;
                if (t >= 1) t = t % 1;
                const position = this.spline.getPoint(t);

                // Tìm distance tương ứng với position
                startDistance = this.findClosestDistance(samples, position);
            }

            // Instantiate object
            const instance = instantiate(this.itemToInstantiate);
            instance.name = `item_${i}`

            // Set parent
            instance.setParent(this.parentNode);


            const splineAnimate = instance.getComponent(SplineAnimate);
            if (splineAnimate) {
                // splineAnimate.autoStart = false;
                splineAnimate.init(this.spline, samples, startDistance);
            }

            
            this.items.push(instance);
        }
    }




    /**
     * Tìm distance gần nhất với position
     */
    private findClosestDistance(samples: Vec3[], targetPos: Vec3): number {
        let minDistance = Infinity;
        let closestDistance = 0;

        for (let i = 0; i < this.spline.lengths.length; i++) {
            const samplePos = samples[i];
            const dist = Vec3.distance(samplePos, targetPos);

            if (dist < minDistance) {
                minDistance = dist;
                closestDistance = this.spline.lengths[i];
            }
        }

        return closestDistance;
    }

    /**
     * Clear tất cả các object đã instantiate
     */
    public clearInstances(): void {
        for (const item of this.items) {
            if (item && item.isValid) {
                item.destroy();
            }
        }
        this.items = [];
    }

    /**
     * Re-instantiate với các parameters mới
     */
    public refresh(): void {
        this.clearInstances();
        this.instantiateAlongSpline();
    }

    /**
     * Lấy item tại index
     */
    public getItem(index: number): Node | null {
        if (index >= 0 && index < this.items.length) {
            return this.items[index];
        }
        return null;
    }

    /**
     * Lấy tất cả items
     */
    public getAllItems(): Node[] {
        return this.items;
    }
}