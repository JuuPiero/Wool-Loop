import { _decorator, CCInteger, Color, Component, instantiate, Label, log, math, MeshRenderer, Node, tween, Vec2, Vec3 } from 'cc';
import { Spool } from '../Spool';
import { PipelineData } from '../LevelDataSA';
import { SpoolManager } from '../SpoolManager';
import { PlayableColorConfig } from '../../Data/ColorConfig';
import { ServiceLocator } from '../../ServiceLocator';
import { IGridItem } from '../IGridItem';
import { GameConfig } from '../GameConfigSA';
import { EventBus } from '../../EventBus';
const { ccclass, property } = _decorator;

@ccclass('Pipeline')
export class Pipeline extends Component implements IGridItem {
    @property(Vec2) position: Vec2;

    @property(CCInteger) public colorIds: number[] = [];
    @property(Spool) public currentSpool: Spool = null;

    @property(Node) public visual: Node = null;

    @property(Node) public popPos: Node = null;

    @property(Label) public label: Label = null;

    colorConfig: PlayableColorConfig = null
    gameConfig: GameConfig = null;

    public pipelineData: PipelineData = null;

    private targetPosition: Vec3 = new Vec3();


    private spoolManager: SpoolManager = null;

    public getPositon() {
        return this.position;
    }

    protected start(): void {
        this.gameConfig = ServiceLocator.get(GameConfig);
        this.spoolManager = ServiceLocator.get(SpoolManager);
        // EventBus.on('SPOOL_FINISHED', this.onSpoolFinished);

    }

    protected onDestroy(): void {
        // Unsubscribe event listener khi pipeline bị destroy
        // EventBus.off('SPOOL_FINISHED', this.onSpoolFinished);
    }

    public init(pipelineData: PipelineData, spoolManager: SpoolManager) {
        this.pipelineData = pipelineData;
        this.position = new Vec2(pipelineData.x, pipelineData.y);
        this.colorConfig = ServiceLocator.get(PlayableColorConfig);

        this.colorIds = [...pipelineData.ids];
        // const colorId = this.colorIds.pop()
        // const angle = this.normalizeAngle(pipelineData.rotate);
        switch (pipelineData.rotate) {
            case 0:
                this.currentSpool = spoolManager.getSpool(pipelineData.x, pipelineData.y + 1);
                break;
            case -90:
                this.currentSpool = spoolManager.getSpool(pipelineData.x + 1, pipelineData.y);
                break;
            case -270:
                this.currentSpool = spoolManager.getSpool(pipelineData.x - 1, pipelineData.y);
                break;
            default:
                break;
        }

        if (this.currentSpool) {
            this.targetPosition = this.currentSpool.node.getPosition();
            // Thay vì gán onExit, listen đến event khi spool này finish
            this.currentSpool.onExitFunc = this.shift;
        }

        this.setColor(pipelineData.ids[0]);
        const rotate = pipelineData.rotate;
        // rotate visual
        this.visual.setRotationFromEuler(0, pipelineData.rotate, 0);

        this.updateUI();
    }

    public updateUI() {
        this.label.string = this.colorIds.length.toString();
        if(this.colorIds.length > 0) {
            this.label.node.active = true;
        }
        else {
            this.label.node.active = false;
        }
    }

    public setColor(colorId: number) {
        const mat = this.visual.getComponentInChildren(MeshRenderer).getMaterialInstance(1);
        mat.setProperty("color", this.colorConfig.getMainColor(colorId));
    }

    shift = (onShiftDone?: (replacementSpool?: Spool) => void) => {
      
        const colorId = this.colorIds.shift()
        if (this.colorIds.length - 1 >= 0) {
            this.setColor(this.colorIds[0]);
        }
        this.updateUI();

        if (colorId != undefined) {

            const node = instantiate(this.gameConfig.spoolPrefab);
            const spool = node.getComponent(Spool);
            node.setParent(this.spoolManager.node);

            // Set initial position and scale (bé)
            // node.setPosition(this.currentSpool.node.position);
            node.setWorldPosition(this.popPos.getWorldPosition());
            node.setScale(0, 0, 0); // Bắt đầu từ kích thước 0

            spool.init({
                x: this.currentSpool.position.x,
                y: this.currentSpool.position.y,
                colorId: colorId
            }, this.spoolManager)

            // Tween scale từ 0 lên 1, sau khi xong mới open để playClickBounce capture đúng scale
            tween(node)
                .to(0.3, {
                    position: this.targetPosition,
                    scale: new Vec3(1, 1, 1)
                }, {
                    easing: 'backOut'
                })
                .call(() => {
                    spool.isOpen = true;
                    spool.isInSlot = false;
                    spool.open();
                    spool.clickFunc = () => {
                        this.spoolManager.onSpoolSelected(spool)
                    }
                    this.currentSpool = spool;
                    this.currentSpool.onExitFunc = this.shift;
                    onShiftDone?.(spool);
                })
                .start();
        } else {
            onShiftDone?.();
        }
    }


}