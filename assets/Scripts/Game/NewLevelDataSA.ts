import { bh } from "db://scriptable-asset/scriptable_runtime"
import { _decorator, CCInteger, CCString, Color, Component, Node } from 'cc';
import { GridSlotData } from "./LevelDataSA";
const { ccclass, property } = _decorator;


// Class cho color hex code mapping
@ccclass('ColorHexCode')
export class ColorHexCode {
    @property
    public Item1: number = 0;

    @property
    public Item2: string = "";
}

// Class cho grid slot data
// @ccclass('GridSlotData')
// export class GridSlotData {
//     @property
//     public coordinateX: number = 0;

//     @property
//     public coordinateY: number = 0;

//     @property
//     public gridSlotType: number = 0;
// }

// Class cho vehicle data
// @ccclass('VehicleData')
// export class VehicleData {
//     @property
//     public entityColorType: number = 0;

//     @property
//     public isHidden: boolean = false;

//     @property
//     public hasIce: boolean = false;

//     @property
//     public iceCount: number = 0;

//     @property
//     public coordinateX: number = 0;

//     @property
//     public coordinateY: number = 0;
// }

// Class cho passenger queue data
@ccclass('PassengerQueueData')
export class PassengerQueueData {
    @property
    public queueIndex: number = 0;

    @property({
        type: [CCString]
    })
    public colorTypesQueue: number[] = [];

    @property({
        type: [CCString]
    })
    public hiddenIndexes: number[] = [];

    @property({
        type: [CCString]
    })
    public passengersGaragesData: any[] = [];
}



@ccclass('NewLevelData')
export class NewLevelData {

    @property({
        type: [ColorHexCode]
    })
    public colorHexCodes: ColorHexCode[] = [];

    @property
    public levelIndex: number = 0;

    @property
    public gridWidth: number = 5;

    @property
    public gridHeight: number = 5;

    @property
    public passengerQueuesCount: number = 2;

    @property
    public hasCurtainCovered: boolean = false;

    @property
    public difficultyType: number = 0;

    @property({
        type: [GridSlotData]
    })
    public gridSlotsData: GridSlotData[] = [];

    // @property({
    //     type: [VehicleData]
    // })
    // public vehiclesData: VehicleData[] = [];

    @property({
        type: [CCString]
    })
    public garagesData: any[] = [];

    @property({
        type: [CCString]
    })
    public vehicleConnectionsData: any[] = [];

    @property({
        type: [CCString]
    })
    public lockAndKeysData: any[] = [];

    @property({
        type: [CCString]
    })
    public multipleLockAndKeysData: any[] = [];

    @property({
        type: [CCString]
    })
    public barriersData: any[] = [];

    @property({
        type: [CCString]
    })
    public cratesData: any[] = [];

    @property({
        type: [CCString]
    })
    public colorSwitchersData: any[] = [];

    @property({
        type: [CCString]
    })
    public wickersData: any[] = [];

    @property({
        type: [CCString]
    })
    public conveyorsData: any[] = [];

    @property({
        type: [CCString]
    })
    public doubledBottlesData: any[] = [];

    @property({
        type: [PassengerQueueData]
    })
    public passengersQueuesData: PassengerQueueData[] = [];



    private colorMap: Map<number, Color> = null;

    public getColorMap(): Map<number, Color> {

        if (this.colorMap === null) {
            this.colorMap = new Map<number, Color>()
            for (const colorHex of this.colorHexCodes) {
                const color: Color = new Color();
                Color.fromHEX(color, colorHex.Item2)
                this.colorMap.set(colorHex.Item1, color);
            }
        }

        return this.colorMap
    }

    public getColor(colorNum: number): Color {
        return this.getColorMap().get(colorNum)
    }

} 