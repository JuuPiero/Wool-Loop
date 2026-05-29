import { _decorator, Component, geometry, MeshRenderer, Node, randomRange, tween, Vec3, Widget } from 'cc';
import { PlayableColorConfig } from '../../Data/ColorConfig';
import { VehicleData } from '../LevelDataSA';
import { ServiceLocator } from '../../ServiceLocator';
import { GameManager } from '../GameManager';
import { Clickable } from '../../Clickable';
import { SlotManager } from '../SlotManager';
const { ccclass, property } = _decorator;

@ccclass('WoolBox')
export class WoolBox extends Clickable {

    @property(MeshRenderer) public renderer: MeshRenderer = null


    @property speed: number = 20
    @property rotateSpeed: number = 20


    init(data: VehicleData, colorConfig: PlayableColorConfig) {
        const mat = this.renderer.getMaterialInstance(0);
        mat.setProperty("color", colorConfig.getMainColor(data.colorTypeValue));
    }
    
    public onClick() {
        const slot = ServiceLocator.get(SlotManager).getAvailableSlot()
        if(slot) {
            
        }
    }
    moveForward() {

    }

    isBlocked() {
        // ray cast to check if there is wool box in front of the box
        const ray = new geometry.Ray(this.node.worldPosition.x, this.node.worldPosition.y, this.node.worldPosition.z, 0, 0, 1)
        
    }
}


