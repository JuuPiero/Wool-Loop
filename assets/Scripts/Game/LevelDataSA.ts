import { _decorator, CCInteger, Component, JsonAsset, Node, Prefab, Vec3 } from 'cc';
const { ccclass, property } = _decorator;
import { bh } from 'db://scriptable-asset/scriptable_runtime';


@ccclass('GridSlotData')
export class GridSlotData {
    @property(CCInteger) public x: number;
    @property(CCInteger) public y: number;
    @property(CCInteger) public colorId: number;
    // @property public isWall: boolean;
}


@ccclass('PipelineData')
export class PipelineData
{
    @property(CCInteger) public x: number;
    @property(CCInteger) public y: number;
    public rotate: number = 0;
    public ids: number[] = []
}


@ccclass('ConveyorData')
export class ConveyorData {
    public colorIds: number[] = []
}

@ccclass('VehicleData')
export class VehicleData {
    @property public vehicleUid: number = -1
    @property public vehicleType: number = 0;
    @property public colorTypeValue: number = 0;
    @property public isHideCar: boolean =  false;
    @property public localPosValueX: number = 0;
    @property public localPosValueY: number = 0.0;
    @property public localPosValueZ: number = 0;
    @property public localRotValueX: number =  0.0;
    @property public localRotValueY: number =  0.0;
    @property public localRotValueZ: number = 0
}


@ccclass('LevelData') // Level runtime
export class LevelData {
    
    @property(CCInteger) public gridWidth;
    @property(CCInteger) public gridHeight;
    @property(CCInteger) public maxSlot;

    @property(GridSlotData) public gridSlots: GridSlotData[] = []
    @property(PipelineData) public pipelines: PipelineData[] = []


    @property(ConveyorData) public mainConveyor = new ConveyorData();

    @property(ConveyorData) public conveyors: ConveyorData[] = []

    @property(VehicleData) public vehicles: VehicleData[] = []
}




@bh.createAssetMenu('LevelDataSA', 'Config/LevelDataSA')
@bh.scriptable('LevelDataSA')
export class LevelDataSA extends bh.ScriptableAsset {

    @property(JsonAsset) public jsonData: JsonAsset = null

    @property(Prefab) public splines: Prefab = null

    public getLevel() {
        const levelData: LevelData = Object.assign(new LevelData(), this.jsonData.json);
        return levelData
    }
} 