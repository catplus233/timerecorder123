// pages/training/index.js
const app = getApp();

// 训练状态枚举
const STATE = {
  LOADING: 'loading',
  BREATHING: 'breathing',       // 调息中
  BREATHING_PREPARE: 'breathing_prepare',  // 调息中（准备阶段，倒计时最后10秒）
  HOLDING: 'holding',           // 闭气中
  RESTING: 'resting',           // 休息中
  COMPLETED: 'completed'        // 训练完成
};

const PREPARE_COUNTDOWN = 10;  // 准备倒计时秒数

Page({
  data: {
    state: STATE.LOADING,
    plan: null,
    currentGroup: 0,
    countdown: 0,
    totalGroups: 0,
    isPaused: false,
    progress: 0,
    prepareCountdown: PREPARE_COUNTDOWN
  },

  audioContext: null,
  intervalTimer: null,

  onLoad(options) {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库');
    } else {
      wx.cloud.init({
        env: app.globalData.env,
        traceUser: true,
      });
    }

    this.initAudio();
    this.loadPlan(options.planId);
  },

  onUnload() {
    this.stopTimer();
    if (this.audioContext) {
      this.audioContext.destroy();
    }
  },

  initAudio() {
    this.audioContext = wx.createInnerAudioContext();
    this.audioContext.volume = 1;
    
    // 添加错误监听
    this.audioContext.onError((err) => {
      console.error('音频播放错误:', err);
    });
    
    // 添加播放结束监听
    this.audioContext.onEnded(() => {
      console.log('音频播放结束');
    });
  },

  // 播放音频（带加载等待）
  playAudio(filePath) {
    if (!this.audioContext) {
      console.error('音频上下文未初始化');
      return;
    }
    
    // 使用绝对路径（真机必需）
    const absolutePath = filePath.startsWith('/') ? filePath : '/' + filePath;
    console.log('播放音频:', absolutePath);
    
    // 先销毁旧的音频上下文，创建新的（避免缓存问题）
    this.audioContext.destroy();
    this.audioContext = wx.createInnerAudioContext();
    this.audioContext.volume = 1;
    
    this.audioContext.src = absolutePath;
    
    // 监听加载完成
    this.audioContext.onCanplay(() => {
      console.log('音频加载完成，开始播放:', absolutePath);
      this.audioContext.play();
    });
    
    // 监听错误
    this.audioContext.onError((err) => {
      console.error('音频播放失败:', absolutePath, err);
    });
  },

  loadPlan(planId) {
    wx.cloud.callFunction({
      name: 'planFunctions',
      data: { action: 'getPlan', planId }
    }).then(res => {
      const plan = res.result.data;
      this.setData({ plan, totalGroups: plan.groups.length });
      this.startTraining();
    }).catch(err => {
      console.error('加载计划失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    });
  },

  startTraining() {
    // 训练开始，播报开始音频
    this.playAudioByName('start');
    this.startBreathingPhase();
  },

  // 调息阶段（包含最后10秒准备倒计时）
  startBreathingPhase() {
    const prepTime = this.data.plan.preparationTime;
    let remaining = prepTime;

    this.setData({ state: STATE.BREATHING, countdown: remaining });

    this.intervalTimer = setInterval(() => {
      if (this.data.isPaused) return;

      remaining--;

      if (remaining <= 0) {
        this.stopTimer();
        this.startHoldPhase(0);
        return;
      }

      this.setData({ countdown: remaining });

      // 最后10秒进入准备状态并播放倒计时+闭气提示
      if (remaining <= PREPARE_COUNTDOWN) {
        this.setData({ state: STATE.BREATHING_PREPARE, prepareCountdown: remaining });
        // 只在进入最后10秒时播放一次
        if (remaining === PREPARE_COUNTDOWN) {
          this.playAudioByName('hold');
        }
      }
    }, 1000);
  },

  startHoldPhase(groupIndex) {
    const groups = this.data.plan.groups;
    const holdTime = groups[groupIndex].holdTime;
    const isLastGroup = groupIndex >= this.data.totalGroups - 1;

    this.setData({
      state: STATE.HOLDING,
      currentGroup: groupIndex + 1,
      countdown: holdTime,
      progress: Math.round((groupIndex / this.data.totalGroups) * 100)
    });

    // 最后一组播放结束音频，其他组播放休息音频
    if (isLastGroup) {
      this.startCountdownWithVoice(holdTime, 'end', () => {
        this.completeTraining();
      });
    } else {
      this.startCountdownWithVoice(holdTime, 'rest', () => {
        this.startRestPhase(groupIndex);
      });
    }
  },

  startRestPhase(groupIndex) {
    const restTime = this.data.plan.groups[groupIndex].restTime;

    this.setData({ state: STATE.RESTING, countdown: restTime });

    // 休息阶段最后10秒倒计时播报
    this.startCountdownWithVoice(restTime, 'hold', () => {
      this.startHoldPhase(groupIndex + 1);
    });
  },

  startCountdownWithVoice(totalSeconds, voiceFile, onComplete) {
    let remaining = totalSeconds;
    let countdownPlayed = false;

    this.intervalTimer = setInterval(() => {
      if (this.data.isPaused) return;

      remaining--;

      if (remaining <= 0) {
        this.stopTimer();
        onComplete();
        return;
      }

      this.setData({ countdown: remaining });

      // 进入最后10秒时播放一次倒计时音频
      if (remaining <= 10 && !countdownPlayed) {
        this.playAudioByName(voiceFile);
        countdownPlayed = true;
      }
    }, 1000);
  },

  stopTimer() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  },

  // 根据文件名播放音频
  playAudioByName(filename) {
    this.playAudio(`/audios/${filename}.mp3`);
  },

  completeTraining() {
    this.setData({
      state: STATE.COMPLETED,
      progress: 100,
      countdown: 0
    });
  },

  togglePause() {
    this.setData({ isPaused: !this.data.isPaused });
  },

  stopTraining() {
    wx.showModal({
      title: '确认终止',
      content: '确定要终止当前训练吗？',
      success: (res) => {
        if (res.confirm) {
          this.stopTimer();
          wx.navigateBack();
        }
      }
    });
  },

  returnToList() {
    wx.navigateBack();
  },

  getStateText() {
    const stateMap = {
      [STATE.LOADING]: '加载中...',
      [STATE.BREATHING]: '调息中',
      [STATE.BREATHING_PREPARE]: '准备中',
      [STATE.HOLDING]: '闭气中',
      [STATE.RESTING]: '休息中',
      [STATE.COMPLETED]: '训练完成'
    };
    return stateMap[this.data.state] || '';
  }
});
