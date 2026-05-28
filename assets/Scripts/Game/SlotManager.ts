import { _decorator, CCFloat, CCInteger, Component, instantiate, Node, Prefab, Vec3 } from 'cc';
import { ServiceLocator } from '../ServiceLocator';
import { Slot } from './Slot';
import { GameConfig } from './GameConfigSA';
import { LevelData } from './LevelDataSA';
const { ccclass, property } = _decorator;

@ccclass('SlotManager')
export class SlotManager extends Component {
    
    @property(CCInteger)
    public slotCount: number

    @property(CCFloat)
    public spacing: number
    
    @property({ type: Slot })
    public slots: Slot[] = []


    public onNewSpoolToSlot;

    onLoad() {
        ServiceLocator.register(SlotManager, this)
    }
    // protected start(): void {
    //     // this.spawnSlots();
    // }

    public init(levelData: LevelData) {
        this.slots = [];

        const gameConfig = ServiceLocator.get(GameConfig)
        // const levelData = ServiceLocator.get(GameManager).currentLevelData
        
        // this.slotCount = levelData.maxSlots
        const totalWidth = (this.slotCount - 1) * this.spacing

        const startX = -totalWidth / 2;

        for (let i = 0; i < this.slotCount; i++) {
            const node = instantiate(gameConfig.slotPrefab)
            node.setParent(this.node);
            node.name = `slot_${i}`

            const x = startX + i * this.spacing;
            node.setPosition(new Vec3(x, -1, 0));

            const slot = node.getComponent(Slot);
            if (slot) {
                this.slots.push(slot);
            }
        }
    } 

   

    public getAvailableSlot(): Slot | null {
        for (const slot of this.slots) {
            if(slot.isAvailable()) return slot
        }
        return null
    }



   
}


