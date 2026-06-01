import { _decorator, CCFloat, CCInteger, Color, Component, director, instantiate, macro, Node, Prefab, Vec2, Vec3 } from 'cc';
import { Spool } from './Spool';
import { ServiceLocator } from '../ServiceLocator';
import { GameConfig } from './GameConfigSA';
import { GameManager, GameState } from './GameManager';
import { EventBus } from '../EventBus';
import { GameEvent } from '../GameEvent';
import { TutorialController } from './UI/TutorialController';
import { SoundManager } from '../SoundManager';
import { WoolManager } from './WoolManager';
import { SOUNDS } from './Sounds';
import { SlotManager } from './SlotManager';
import { print } from '../ultils';
// import { GridSlotData, NewLevelData } from './NewLevelDataSA';
import { MatchZone } from './MatchZone';
import { ETrackingEvent, TrackingManager } from '../TrackingManager';
import { PlayableManager } from './PlayableManager';
import { GridSlotData, LevelData, PipelineData } from './LevelDataSA';
import { PlayableColorConfig } from '../Data/ColorConfig';
import { Pipeline } from './GridItem/Pipeline';
const { ccclass, property } = _decorator;

@ccclass('SpoolManager')
export class SpoolManager extends Component {


    @property(CCFloat)
    public spacing: number

    @property public forceOpenStore = false
    @property public tapCount = 0
    @property public maxTapToOpenStore = 5


    @property(Node) public spoolContainer: Node = null

    @property({ type: Spool })
    public spools: Spool[] = []


    @property({ type: Pipeline }) public pipelines: Pipeline[] = []

    public spoolsMap: Map<string, Spool> = new Map<string, Spool>()
    public validSpoolPositions: Set<string> = new Set<string>()
    private maxRow = 0
    private maxCol = 0

    protected gameManager: GameManager = null

    public gameConfig: GameConfig = null

    public progress = 0
    public total = 0
    progressTracked = {
        quarter: false,  // 25%
        half: false,     // 50%
        threeQuarter: false  // 75%
    }


    protected onLoad(): void {
        ServiceLocator.register(SpoolManager, this)
    }

    protected onEnable(): void {
        EventBus.on(GameEvent.COLLECT_DONE, this.onCollectDone)
    }

    protected onDisable(): void {
        EventBus.off(GameEvent.COLLECT_DONE, this.onCollectDone)
    }
    protected start(): void {
        this.gameManager = ServiceLocator.get(GameManager);
    }

    onCollectDone = () => {
        this.progress++

        const percentage = (this.progress / this.total) * 100
        console.log("progress " + percentage)

        if (!this.progressTracked.quarter && percentage >= 25) {
            this.progressTracked.quarter = true
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_25)
        }

        if (!this.progressTracked.half && percentage >= 50) {
            this.progressTracked.half = true
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_50)
        }

        if (!this.progressTracked.threeQuarter && percentage >= 75) {
            this.progressTracked.threeQuarter = true
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_PASS_75)
        }
        this.checkWin()
    }


    public init(newLevelData: LevelData = null, colorConfig: PlayableColorConfig) {
        const gameConfig = ServiceLocator.get(GameConfig);
        this.gameConfig = gameConfig;
        const columns = newLevelData.gridWidth;
        const rows = newLevelData.gridHeight;
        this.maxRow = 0;
        this.maxCol = 0;

        const totalWidth = (columns - 1) * this.spacing;
        const totalDepth = (rows - 1) * this.spacing;

        const startX = -totalWidth / 2;
        const startZ = -totalDepth / 2;
        this.total = newLevelData.gridSlots.length
        this.validSpoolPositions.clear();

        for (const item of newLevelData.gridSlots) {

            const col = item.x;
            const row = item.y;
            this.maxRow = Math.max(this.maxRow, row);
            this.maxCol = Math.max(this.maxCol, col);
            const spool = this.createSpool(item);
            spool.node.setParent(this.node);
            spool.init(item, this, () => {
                this.onSpoolSelected(spool)
            })
            // spool.color = colorConfig.getMainColor(item.colorId) || Color.WHITE;
            const x = startX + col * this.spacing;
            const z = startZ + (rows - 1 - row) * this.spacing;
            spool.node.setPosition(new Vec3(x, 0, z));
        }

        const pipelineDatas = newLevelData.pipelines;
        for (const pipelineData of pipelineDatas) {
            const col = pipelineData.x;
            const row = pipelineData.y;

            const node = instantiate(gameConfig.pipelinePrefab);
            const pipeline = node.getComponent(Pipeline);

            if (!pipeline) {
                node.removeFromParent();
                continue;
            }

            node.name = `Pipeline_(${col}, ${row})`;
            this.pipelines.push(pipeline);
            if (this.spoolContainer) {
                node.setParent(this.spoolContainer);
            }
            else {
                node.setParent(this.node);
            }
            const x = startX + col * this.spacing;
            const z = startZ + (rows - 1 - row) * this.spacing;

            node.setPosition(new Vec3(x, 0, z));
            pipeline.init(pipelineData, this);
        }
    }


    public createSpool(data: GridSlotData): Spool {
        const node = instantiate(this.gameConfig.spoolPrefab);
        const spool = node.getComponent(Spool);
        if (!spool) {
            node.removeFromParent();
            return;
        }
        // spool.init(data, this);
        return spool
    }

    public getSpool(col: number, row: number): Spool | undefined {
        return this.spoolsMap.get(`${col}_${row}`)
    }

    public isValidPosition(col: number, row: number): boolean {
        return this.validSpoolPositions.has(`${col}_${row}`)
    }

    public getMaxRow(): number {
        return this.maxRow;
    }

    public remove(spool: Spool) {
        const index = this.spools.indexOf(spool)
        if (index >= 0) {
            this.spools.splice(index, 1)
        }
        const key = `${spool.position.x}_${spool.position.y}`
        if (this.spoolsMap.get(key) === spool) {
            this.spoolsMap.delete(key)
        }
        this.updateOpenStates()
    }

    private updateOpenStates() {
        // Keep top-row spools open by default.
        for (const spool of this.spools) {
            if (spool.position.y === this.maxRow && !spool.isOpen) {
                spool.isOpen = true;
                spool.open();
            }
        }

        const emptyReachable = new Set<string>();
        const queue: Array<{ x: number; y: number }> = [];

        for (const key of this.validSpoolPositions) {
            const [x, y] = key.split('_').map(Number);
            if (y === this.maxRow && !this.spoolsMap.has(key)) {
                emptyReachable.add(key);
                queue.push({ x, y });
            }
        }

        const dirs = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
        ];

        while (queue.length > 0) {
            const current = queue.shift()!;
            for (const dir of dirs) {
                const nx = current.x + dir.x;
                const ny = current.y + dir.y;
                const key = `${nx}_${ny}`;

                if (!this.isValidPosition(nx, ny)) continue;
                if (this.spoolsMap.has(key)) continue;
                if (emptyReachable.has(key)) continue;

                emptyReachable.add(key);
                queue.push({ x: nx, y: ny });
            }
        }

        for (const emptyKey of emptyReachable) {
            const [x, y] = emptyKey.split('_').map(Number);
            for (const dir of dirs) {
                const neighborKey = `${x + dir.x}_${y + dir.y}`;
                const neighborSpool = this.spoolsMap.get(neighborKey);
                if (!neighborSpool) continue;
                if (!neighborSpool.isOpen) {
                    neighborSpool.isOpen = true;
                    neighborSpool.open();
                }
            }
        }
    }


    public checkWin() {
        if (this.gameManager.state !== GameState.PLAY) return
        if (this.spools.length == 0) {
            console.log('win');
            this.gameManager.state = GameState.WIN
            SoundManager.instance.playOneShot(SOUNDS.WIN)
            const confetiEffect = instantiate(ServiceLocator.get(GameConfig).confettiEffect)
            const scene = director.getScene();
            confetiEffect.setParent(scene)

            EventBus.emit(GameEvent.LEVEL_COMPLETED)
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_SOLVED)
            const woolManager = ServiceLocator.get(WoolManager);

        }
    }

    public onSpoolSelected(spool: Spool) {
        spool.playClickBounce(undefined, () => {
            if (Spool.delay) return
            if (spool.isFlying || spool.isInSlot) return;
            if (spool.isSpawning) return;
            if (!spool.isOpen) {
                SoundManager.instance.playOneShot(SOUNDS.FAILED);
                return;
            }
            const tut = ServiceLocator.get(TutorialController)
            if (tut && tut.node.active) {
                tut.node.active = false
                TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_STARTED)
            }
            const slot = ServiceLocator.get(SlotManager).getAvailableSlot();
            if (!slot) {
                SoundManager.instance.playOneShot('Failed');
                console.log('out of slot');
                return;
            }
            if (this.forceOpenStore) {
                this.tapCount++
                if (this.tapCount >= this.maxTapToOpenStore) {
                    PlayableManager.forceInstall()
                    this.tapCount = 0
                }
            }
            Spool.delay = true

            SoundManager.instance.playOneShot(SOUNDS.CLICK);
            spool.shadow.active = false
           
            spool.moveToSlot(slot, () => {
                this.checkLose();
            });
        })
    }

    public checkLose() {
        const slotManager = ServiceLocator.get(SlotManager);
        const woolManager = ServiceLocator.get(WoolManager);
        const matchZone = ServiceLocator.get(MatchZone);

        // 1. Nếu vẫn còn slot trống hoặc slot đã được reserve bởi WoolBox thì chưa thể thua
        const hasPendingSlot = slotManager.slots.some(slot => slot.isAvailable() || !!slot['_reservedBy']);
        if (hasPendingSlot) return;

        const areSubRaysEmpty = woolManager.subRays.every(subRay =>
            subRay.raySlots.every(slot => slot.wool === null)
        );

        const isMainRayFull = woolManager.slots.every(slot => slot.wool !== null);

        // Nếu Sub Rays vẫn còn len VÀ Main Ray chưa bị lấp đầy hoàn toàn
        // -> Có nghĩa là len từ Sub Ray vẫn có thể đi vào Main Ray -> Bỏ qua check lose.
        if (!areSubRaysEmpty && !isMainRayFull) {
            return;
        }

        // 2. Nếu có bất kỳ Spool nào đang thu len thì chờ nó hoàn thành.
        for (const slot of slotManager.slots) {
            if (slot.spool && slot.spool.isCollecting) {
                return;
            }
        }

        // 3. Kiểm tra xem trên sân (Main Ray + MatchZone) còn cục len nào 
        // có màu trùng với các Spool đang đợi trong Slot hay không.
        const allWoolsOnField = [
            ...woolManager.slots.filter(s => s.wool).map(s => s.wool),
            ...Array.from(matchZone.itemsInMatchZone)
                .filter(raySlot => raySlot.wool)
                .map(raySlot => raySlot.wool),
        ];

        let hasMatchableWool = false;
        for (const slot of slotManager.slots) {
            const spool = slot.spool;
            if (!spool) continue;

            const match = allWoolsOnField.find(wool => wool.color.equals(spool.color));
            if (match) {
                hasMatchableWool = true;
                break;
            }
        }

        // 4. Nếu full slot VÀ không còn Spool nào đang thu dây VÀ không còn len cùng màu trên sân
        if (!hasMatchableWool) {
            console.log('Lose: No more wools to collect and all slots are full');
            this.gameManager.state = GameState.LOSE;
            EventBus.emit(GameEvent.LEVEL_FAILED)
        }
    }

}
