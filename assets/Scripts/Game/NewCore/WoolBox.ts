import { _decorator, Component, MeshRenderer, Node, tween, Vec3, Widget } from 'cc';
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

    
    carOutTween(target: Node){

        // AudioManager.instance.PlayAudio(AudioType.CarFull);
        var outParkings = target.getWorldPosition()
        var DistanceOutParkings = Vec3.distance(outParkings, this.node.getWorldPosition())
        var TimeMoveOutParkings = DistanceOutParkings / this.speed;
        
        var endPoint = ServiceLocator.get(GameManager).leavingEndPoint.getWorldPosition()
        var DistanceEndPoint = Vec3.distance(endPoint, this.node.getWorldPosition())
        var TimeMoveEndPoint = DistanceEndPoint / this.speed; 
        

        // EventListener.emit(GameEvent.onCarMove, this);
        // EventListener.emit(GameEvent.Event_AddPoint, this.seats.length);

        tween(this.node)
        .to(TimeMoveOutParkings, {worldPosition: outParkings})
        .call(()=>{
            const carforward = this.node.forward.clone()
            tween(carforward)
            .to(this.rotateSpeed, {x:-1, y:0, z:0}, {onUpdate:()=>{
                this.node.forward = carforward
            }})
            .start()
        })
        .delay(this.rotateSpeed)
        .to(TimeMoveEndPoint, {worldPosition: endPoint})
        .call(()=>{
            // GameManager.instance.combo(target);
            // this.carOut()
        })
        .start()
    }
    public onClick() {
        const slot = ServiceLocator.get(SlotManager).getAvailableSlot()
        if(slot) {
            this.carOutTween(slot.node)
        }
        console.log("Hello world");
        
    }

}


