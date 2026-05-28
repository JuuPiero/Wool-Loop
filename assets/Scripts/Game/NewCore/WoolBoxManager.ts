import { _decorator, Component, instantiate, Node } from 'cc';
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
}


