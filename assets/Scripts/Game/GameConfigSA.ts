import { _decorator, CCString, Color, JsonAsset, Prefab } from 'cc';
const { ccclass, property } = _decorator;
import { bh } from 'db://scriptable-asset/scriptable_runtime';




@bh.createAssetMenu('GameConfig', 'Config/GameConfig')
@bh.scriptable('GameConfig')
export class GameConfig extends bh.ScriptableAsset {

    @property(Prefab)
    public spoolPrefab: Prefab


    @property(Prefab)
    public pipelinePrefab: Prefab


    @property(Prefab)
    public slotPrefab: Prefab

    @property(Prefab)
    public woolPrefab: Prefab

    
    @property(Prefab)
    public ropePrefab: Prefab

    @property(Prefab)
    public completedEffect: Prefab

    @property(Prefab)
    public confettiEffect: Prefab

    @property(Prefab) public hitEffect: Prefab

    @property(CCString) public googleStoreUrl: string
    @property(CCString) public appleStoreUrl: string = ""


    @property(JsonAsset) public colorConfigJson: JsonAsset = null;
    
    @property(Prefab) public woolBoxPrefabs: Prefab[] = []
   
    onLoaded(): void {
        
    }

    
} 
