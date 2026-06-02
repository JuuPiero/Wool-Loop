import { _decorator, BoxCollider, Camera, Component, EventTouch, find, geometry, instantiate, Line, LineComponent, Node, physics, PhysicsSystem, RigidBody, Tween, tween, Vec3 } from 'cc';
import { ServiceLocator } from '../../ServiceLocator';
import { GameConfig } from '../GameConfigSA';
import { LevelData, VehicleData } from '../LevelDataSA';
import { PlayableColorConfig } from '../../Data/ColorConfig';
import { WoolBox } from './WoolBox';
import { EDITOR, PREVIEW } from 'cc/env';
const { ccclass, property } = _decorator;

const BOUND_OFFSET = 3

@ccclass('WoolBoxManager')
export class WoolBoxManager extends Component {
    @property public spacing: number = 2

    @property public minPositionX: number = 0
    @property public maxPositionX: number = 0

    @property public minPositionZ: number = 0
    @property public maxPositionZ: number = 0

    @property enableDebugLine: boolean = false
    @property(Line) public lineDebug: Line = null

    init(levelData: LevelData, colorConfig: PlayableColorConfig) {

        const vehicles = levelData.vehicles
        const boxPrefabs = ServiceLocator.get(GameConfig).woolBoxPrefabs


        vehicles?.forEach((item: VehicleData, index) => {
            const node = instantiate(boxPrefabs[item.vehicleType])
            node.setParent(this.node)
            node.setPosition(item.localPosValueX, item.localPosValueY, item.localPosValueZ)
            // node.setRotationFromEuler(item.localRotValueX, item.localRotValueY, item.localPosValueZ )
            node.setRotationFromEuler(item.localRotValueX, item.localRotValueY, -180 )

            const woolBox = node.getComponent(WoolBox)
            woolBox.init(item, colorConfig, this)
            node.name = node.name + "_" + index
        })
        const temp = vehicles.map(v => v.colorTypeValue)
        console.log(temp.length);

        console.log(temp.toString());
        

        const allBox = this.getComponentsInChildren(WoolBox)

        this.minPositionX = allBox.reduce((prev, curr) =>
            curr.node.position.x < prev.node.position.x ? curr : prev
        ).node.position.clone().x - BOUND_OFFSET;

        this.maxPositionX = allBox.reduce((prev, curr) =>
            curr.node.position.x > prev.node.position.x ? curr : prev
        ).node.position.clone().x + BOUND_OFFSET;

        this.minPositionZ = allBox.reduce((prev, curr) =>
            curr.node.position.z > prev.node.position.z ? curr : prev
        ).node.position.clone().z + BOUND_OFFSET;

        this.maxPositionZ = allBox.reduce((prev, curr) =>
            curr.node.position.z < prev.node.position.z ? curr : prev
        ).node.position.clone().z - BOUND_OFFSET;
        if (this.enableDebugLine) {
            if (EDITOR || PREVIEW) {
                if (!this.lineDebug) {
                    this.lineDebug = this.node.addComponent(Line)
                }
                const p1 = new Vec3(this.minPositionX, 0, this.maxPositionZ)
                const p2 = new Vec3(this.maxPositionX, 0, this.maxPositionZ)
                const p3 = new Vec3(this.maxPositionX, 0, this.minPositionZ)
                const p4 = new Vec3(this.minPositionX, 0, this.minPositionZ)

                this.lineDebug.positions = [p1, p2, p3, p4, p1]
            }
        }



    }

    touchStart(event: EventTouch) {


    }


}


