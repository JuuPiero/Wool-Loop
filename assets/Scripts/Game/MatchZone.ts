import { _decorator, BoxCollider, Color, Component, ITriggerEvent, Node, tween, Vec3, Quat, PhysicsSystem, Vec2 } from 'cc';
import { SlotManager } from './SlotManager';
import { ServiceLocator } from '../ServiceLocator';

import { WoolManager } from './WoolManager';

import { RaySlot } from './RaySlot';
import { GameManager, GameState } from './GameManager';
import { SplineAnimate } from '../SplineAnimate';
const { ccclass, property } = _decorator;

@ccclass('MatchZone')
export class MatchZone extends Component {

    private slotManager: SlotManager;
    public woolManager: WoolManager;
    public gameManager: GameManager
    private collider: BoxCollider;

    public itemsInMatchZone: Set<RaySlot> = new Set<RaySlot>

    // Tập wool ĐANG THẬT SỰ nằm trong zone, theo dõi bằng chính trigger enter/exit
    // (đúng theo va chạm collider). Khác itemsInMatchZone ở chỗ: KHÔNG bị xóa khi
    // wool được gán cho 1 spool. Dùng để spool mới gom đầy đủ cục đang ở trong zone
    // ngay khi vào slot (kể cả cục ở mép đầu mà scan theo tâm dễ bỏ sót).
    public woolsInZone: Set<RaySlot> = new Set<RaySlot>()


    protected start() {
        this.slotManager = ServiceLocator.get(SlotManager);
        this.woolManager = ServiceLocator.get(WoolManager);
        this.gameManager = ServiceLocator.get(GameManager)

    }

    protected onLoad(): void {
        ServiceLocator.register(MatchZone, this)
        this.collider = this.getComponent(BoxCollider);
        this.collider?.on('onTriggerEnter', this.onTriggerEnter, this);
        this.collider?.on('onTriggerExit', this.onTriggerExit, this);
    }
    protected onDestroy(): void {
        this.collider?.off('onTriggerEnter', this.onTriggerEnter, this);
        this.collider?.off('onTriggerExit', this.onTriggerExit, this);
    }
    onTriggerExit(event: ITriggerEvent) {
        const raySlot = event.otherCollider.getComponent(RaySlot);
        if (!raySlot) return;

        raySlot.canCollect = false;
        raySlot.isCollecting = false;
        this.itemsInMatchZone.delete(raySlot);
        this.woolsInZone.delete(raySlot);

        // BỔ SUNG: Tìm xem có Spool nào đang chứa raySlot này trong queue không và xóa nó đi
        const allSlots = this.slotManager.slots;
        for (const slot of allSlots) {
            if (slot.spool && slot.spool.queue.length > 0) {
                const index = slot.spool.queue.indexOf(raySlot);
                if (index !== -1) {
                    slot.spool.queue.splice(index, 1);
                }
            }
        }
    }

    onTriggerEnter(event: ITriggerEvent) {
        const raySlot = event.otherCollider.getComponent(RaySlot);
        if (!raySlot || !raySlot.wool) return;
        // Luôn track sự hiện diện trong zone, KỂ CẢ trước khi vào PLAY, để spool
        // mới gom được cả cục đã vào zone từ lúc loading.
        this.woolsInZone.add(raySlot);

        if (!this.gameManager || this.gameManager.state !== GameState.PLAY) return;
        if (raySlot.isCollecting) return;

        raySlot.canCollect = true;

        const slots = this.slotManager.slots;

        const eligibleSlots = slots
            .filter(slot => {
                const spool = slot.spool;
                return spool && !spool.isFull() && spool.color.equals(raySlot.wool.color);
            })
            .sort((a, b) => (b.spool?.count || 0) - (a.spool?.count || 0));

        // Duyệt qua các slot đã được sắp xếp
        for (const slot of eligibleSlots) {
            const spool = slot.spool;
            if (!spool) continue;

            if (spool.queue.indexOf(raySlot) === -1) {
                spool.insertSorted(raySlot);
                // Chỉ gọi collects nếu spool không đang collect
                if (!spool.isCollecting) {
                    spool.collects();
                }
            }

            return;
        }

        this.itemsInMatchZone.add(raySlot);
        this.checkExistingItems();
    }
    /**
     * Lấy TẤT CẢ wool cùng màu đang thật sự nằm trong zone (theo woolsInZone — tập
     * được cập nhật bằng chính trigger enter/exit nên khớp va chạm collider, không
     * bỏ sót cục ở mép như cách quét theo tâm). Dùng khi 1 spool vừa vào slot để
     * gom đầy đủ queue ngay lập tức. Bỏ qua cục đang được spool khác thu.
     */
    public getMatchingWoolsInZone(color: Color): RaySlot[] {
        const seen = new Set<RaySlot>();
        const result: RaySlot[] = [];

        const tryAdd = (raySlot: RaySlot) => {
            if (!raySlot || !raySlot.wool) return;
            if (raySlot.isCollecting) return;
            if (!raySlot.wool.color.equals(color)) return;
            if (seen.has(raySlot)) return;
            seen.add(raySlot);
            result.push(raySlot);
        };

        // 1) Trigger-exact: cục đã enter zone (khớp va chạm collider, kể cả ở mép).
        for (const raySlot of this.woolsInZone) tryAdd(raySlot);

        // 2) Safety-net hình học: cục nằm trong box nhưng chưa từng bắn onTriggerEnter
        //    (spawn sẵn trong zone). Check theo tâm nên có thể sót cục sát mép, nhưng
        //    những cục đó thường đã nằm trong woolsInZone ở bước 1.
        if (!this.woolManager) this.woolManager = ServiceLocator.get(WoolManager);
        if (this.collider && this.woolManager) {
            const half = this.collider.size;
            const center = this.collider.center;
            const local = new Vec3();
            for (const raySlot of this.woolManager.slots) {
                if (!raySlot || !raySlot.wool) continue;
                this.node.inverseTransformPoint(local, raySlot.node.worldPosition);
                local.subtract(center);
                if (Math.abs(local.x) <= half.x * 0.5 &&
                    Math.abs(local.y) <= half.y * 0.5 &&
                    Math.abs(local.z) <= half.z * 0.5) {
                    tryAdd(raySlot);
                }
            }
        }

        return result;
    }

    public checkExistingItems() {
        if (this.itemsInMatchZone.size === 0) return;

        // const sortedItems = Array.from(this.itemsInMatchZone)
        //     .sort((a, b) => {
        //         // Lấy distance hiện tại từ component SplineAnimate
        //         const distA = a.getComponent(SplineAnimate).getDistance();
        //         const distB = b.getComponent(SplineAnimate).getDistance();
        //         // Sắp xếp để thằng có distance nhỏ hơn (đi trước) được ưu tiên
        //         return distA - distB;
        //     });

        const sortedItems = Array.from(this.itemsInMatchZone)
        .sort((a, b) => b.index - a.index);
        for (const raySlot of sortedItems) {
            if (!raySlot || !raySlot.wool || raySlot.isCollecting || !raySlot.canCollect) continue;

            // Tìm Spool phù hợp nhất
            const eligibleSlots = this.slotManager.slots
                .filter(slot => {
                    const spool = slot.spool;
                    return spool && !spool.isFull() && spool.color.equals(raySlot.wool.color);
                })
                .sort((a, b) => (b.spool?.count || 0) - (a.spool?.count || 0));

            for (const slot of eligibleSlots) {
                const spool = slot.spool;
                if (spool && spool.queue.indexOf(raySlot) === -1) {
                    this.itemsInMatchZone.delete(raySlot);
                    spool.insertSorted(raySlot);

                    if (!spool.isCollecting) {
                        spool.collects();
                    }
                    break;
                }
            }
        }
    }
}