import { _decorator, CCBoolean, Color, Component, EventKeyboard, Input, input, instantiate, JsonAsset, KeyCode, log, Node, sys } from 'cc';
import { GameConfig } from './GameConfigSA';
import { ServiceLocator } from '../ServiceLocator';
import { EventBus } from '../EventBus';
import { GameEvent } from '../GameEvent';
import super_html_playable from '../super_html_playable';
import { NavigationContainer } from '../Navigation/NavigationContainer';
import { SpoolManager } from './SpoolManager';
import { WoolManager } from './WoolManager';
import { SlotManager } from './SlotManager';
import { SCREENS } from './UI/Screens';
import { SoundManager } from '../SoundManager';
import { ETrackingEvent, TrackingManager } from '../TrackingManager';
import { LevelData, LevelDataSA } from './LevelDataSA';
import { PlayableColorConfig } from '../Data/ColorConfig';
import { SOUNDS } from './Sounds';
import { WoolBoxManager } from './NewCore/WoolBoxManager';
const { ccclass, property } = _decorator;

export enum GameState {
    WIN,
    LOSE,
    PLAY
}
@ccclass('GameManager')
export class GameManager extends Component {
   
    @property(GameConfig) public gameConfig: GameConfig;

    @property(LevelDataSA) public currentLevelData: LevelDataSA;


    // @property(JsonAsset) public levelJson: JsonAsset = null

    // @property(NewLevelData)
    // public newLevelData: NewLevelData = null
    public levelData: LevelData = null


    public colorConfig: PlayableColorConfig = null


    public state: GameState = GameState.PLAY

    public speedMultiplier = .025

    @property(SpoolManager) public spoolManager: SpoolManager = null
    @property(WoolManager) public woolManager: WoolManager = null
    @property(SlotManager) public slotManager: SlotManager = null
    @property(WoolBoxManager) public woolBoxManager: WoolBoxManager = null


    
    _button: boolean = false
    @property({ type: CCBoolean })
    public set button(v : boolean) {
        // this._button = v;
        console.log("Hello world");
    }
    public get button(): boolean {
        return this._button;
    }

    
    protected onEnable(): void {
        if (sys.os == sys.OS.WINDOWS) {
            input.on(Input.EventType.KEY_DOWN, this.onPressButton, this);
        }

        EventBus.on(GameEvent.NEW_GAME, this.onNewGame)
        EventBus.on(GameEvent.LEVEL_FAILED, this.onLose)
        EventBus.on(GameEvent.LEVEL_COMPLETED, this.installGame)

    }
    protected onDisable(): void {
        if (sys.os == sys.OS.WINDOWS) {
            input.off(Input.EventType.KEY_DOWN, this.onPressButton, this);
        }

        EventBus.off(GameEvent.NEW_GAME, this.onNewGame)
        EventBus.off(GameEvent.LEVEL_FAILED, this.onLose)
        EventBus.off(GameEvent.LEVEL_COMPLETED, this.installGame)

    }

    onPressButton(eventKeyboard: EventKeyboard) {
        if (eventKeyboard.keyCode == KeyCode.F12) {
            EventBus.emit(GameEvent.TOGGLE_VIDEO);
        }
    }

    protected onLoad(): void {
        if (this.gameConfig) {
            ServiceLocator.register(GameConfig, this.gameConfig)
            ServiceLocator.register(GameManager, this)
        }
        this.setupLinkStore()
        // this.loadLevel()
    
    }
    protected start(): void {
       EventBus.emit(GameEvent.NEW_GAME)
    }

    onNewGame = () => {
        const colorRaw = this.gameConfig.colorConfigJson.json;
        this.colorConfig = Object.assign(new PlayableColorConfig, colorRaw);
        this.levelData = this.currentLevelData.getLevel();

        // console.log(this.levelData.vehicles.length);
        

        ServiceLocator.register(PlayableColorConfig, this.colorConfig)


        TrackingManager.TrackEvent(ETrackingEvent.LOADING)
        if(this.currentLevelData.splines) {
            const splinesNode = instantiate(this.currentLevelData.splines)
            splinesNode.setParent(this.node)
            this.woolManager = splinesNode.getComponent(WoolManager)
        }

        this.woolManager.init(this.levelData, this.colorConfig)
        // this.spoolManager.init(this.levelData, this.colorConfig)
        this.slotManager.init(this.levelData)
        this.woolBoxManager.init(this.levelData, this.colorConfig)

        SoundManager.instance.playMusic("BGM", true)
        TrackingManager.TrackEvent(ETrackingEvent.LOADED)
        TrackingManager.TrackEvent(ETrackingEvent.DISPLAYED)
    }
    onLose = () => {
        ServiceLocator.get(NavigationContainer).stack.navigate(SCREENS.ENDCARD)
        super_html_playable.game_end()
        super_html_playable.download()
        SoundManager.instance.stopMusic()
        SoundManager.instance.playOneShot(SOUNDS.Lose);
        TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_FAILED)
    }

    setupLinkStore() {
        super_html_playable.set_google_play_url(this.gameConfig.storeUrl)

    }

    installGame = () => {
        ServiceLocator.get(NavigationContainer).stack.navigate(SCREENS.ENDCARD)
        super_html_playable.game_end()
        super_html_playable.download()
    }
}
