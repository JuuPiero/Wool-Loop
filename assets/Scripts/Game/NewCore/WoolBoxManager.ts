import { _decorator, BoxCollider, Camera, Component, EventTouch, find, geometry, instantiate, Node, physics, PhysicsSystem, RigidBody, Tween, tween, Vec3 } from 'cc';
import { ServiceLocator } from '../../ServiceLocator';
import { GameConfig } from '../GameConfigSA';
import { LevelData, VehicleData } from '../LevelDataSA';
import { PlayableColorConfig } from '../../Data/ColorConfig';
import { WoolBox } from './WoolBox';
const { ccclass, property } = _decorator;

@ccclass('WoolBoxManager')
export class WoolBoxManager extends Component {
    
    
    init(levelData: LevelData, colorConfig: PlayableColorConfig) {
        const vehicles = levelData.vehicles
        const boxPrefabs = ServiceLocator.get(GameConfig).woolBoxPrefabs
        vehicles.forEach((item: VehicleData) => {
            const node = instantiate(boxPrefabs[item.vehicleType])
            node.setParent(this.node)
            node.setPosition(item.localPosValueX, item.localPosValueY, item.localPosValueZ)
            node.setRotationFromEuler(item.localRotValueX, item.localRotValueY, item.localPosValueZ)
            const woolBox = node.getComponent(WoolBox)
            woolBox.init(item, colorConfig)
        })

    }

    touchStart(event: EventTouch) {
        
        
    }

 
    hitPointTween(
        car: Node,
        targetPoint: Node,
        tweenCar: Tween<Node>,
        hitPoint: Vec3 = null
    ) {
        const rotateSpeed = 0.05
        const carSpeed = 35

        const pointForward: Vec3 = hitPoint
            .clone()
            .subtract(targetPoint.getWorldPosition())
            .normalize();

        var Distance = Vec3.distance(car.getWorldPosition(), hitPoint);
        var timeMove = Distance / carSpeed;

        tweenCar
            .to(timeMove, {
                worldPosition: hitPoint,
            })
            .call(() => {
                const carforward = car.forward.clone();
                tween(carforward)
                    .to(
                        rotateSpeed,
                        {
                            x: pointForward.x,
                            y: pointForward.y,
                            z: pointForward.z,
                        },
                        {
                            onUpdate: () => {
                                car.forward = carforward;
                            },
                        }
                    )
                    .start();
            })
            .delay(rotateSpeed);
    }
}


