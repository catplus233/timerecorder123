// pages/pbExecute/index.js
const app = getApp();

const STATE = {
  PREPARING: 'preparing',
  HOLDING: 'holding',
  COMPLETED: 'completed',
  STOPPED: 'stopped'
};

const PREP_TIME = 60; // 准备阶段时长（秒）

Page({
  data: {
    state: STATE.PREPARING,
    countdown: PREP_TIME,
    totalDuration: 0,
    targetDisplay: ''
  },

  audioContext: null,
  intervalTimer: null,
  elapsedSeconds: 0,
  nextHintSecond: 60,     // 下一个提示的已过秒数
  hintPlayedSet: null,    // 已播放提示的秒数集合

  onLoad(options) {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库');
    } else {
      wx.cloud.init({
        env: app.globalData.env,
        traceUser: true,
      });
    }

    const minutes = parseInt(options.minutes) || 2;
    const seconds = parseInt(options.seconds) || 0;
    const totalDuration = minutes * 60 + seconds;

    this.setData({
      totalDuration,
      targetDisplay: minutes + ' 分 ' + String(seconds).padStart(2, '0') + ' 秒'
    });

    this.hintPlayedSet = new Set();
    this.initAudio();
    this.startPreparePhase();
  },

  onUnload() {
    this.stopTimer();
    if (this.audioContext) {
      this.audioContext.destroy();
      this.audioContext = null;
    }
  },

  initAudio() {
    this.audioContext = wx.createInnerAudioContext();
    this.audioContext.volume = 1;
    this.audioContext.onError((err) => {
      console.error('音频播放错误:', err);
    });
  },

  playAudio(filePath) {
    if (!this.audioContext) return;
    const absolutePath = filePath.startsWith('/') ? filePath : '/' + filePath;
    console.log('播放音频:', absolutePath);
    this.audioContext.destroy();
    this.audioContext = wx.createInnerAudioContext();
    this.audioContext.volume = 1;
    this.audioContext.src = absolutePath;
    this.audioContext.onCanplay(() => {
      this.audioContext.play();
    });
    this.audioContext.onError((err) => {
      console.error('音频播放失败:', absolutePath, err);
    });
  },

  playAudioByName(filename) {
    this.playAudio(`/audios/${filename}.mp3`);
  },

  // ==================== 准备阶段 ====================
  startPreparePhase() {
    let remaining = PREP_TIME;
    this.setData({ state: STATE.PREPARING, countdown: remaining });

    this.intervalTimer = setInterval(() => {
      remaining--;
      this.setData({ countdown: remaining });

      if (remaining <= 0) {
        this.stopTimer();
        this.startHoldPhase();
        return;
      }

      // 准备阶段最后10秒播放闭气提示
      if (remaining === 10) {
        this.playAudioByName('hold');
      }
    }, 1000);
  },

  // ==================== 闭气阶段 ====================
  startHoldPhase() {
    const totalDuration = this.data.totalDuration;
    let remaining = totalDuration;
    this.elapsedSeconds = 0;
    this.nextHintSecond = 60;

    this.setData({ state: STATE.HOLDING, countdown: remaining });

    this.intervalTimer = setInterval(() => {
      remaining--;
      this.elapsedSeconds++;

      if (remaining <= 0) {
        this.stopTimer();
        this.completeChallenge();
        return;
      }

      this.setData({ countdown: remaining });

      // 最后10秒播放结束倒计时
      if (remaining === 10) {
        this.playAudioByName('end');
      }

      // 每隔30秒播放时间提示（从第60秒开始）
      this.checkAndPlayHint();
    }, 1000);
  },

  // 检查并播放时间提示
  checkAndPlayHint() {
    const elapsed = this.elapsedSeconds;
    const totalDuration = this.data.totalDuration;

    // 只在整30秒的倍数时检查（从60秒开始）
    if (elapsed < 60 || elapsed % 30 !== 0) return;
    // 避免重复播放
    if (this.hintPlayedSet.has(elapsed)) return;

    // 重叠处理：remaining <= 10 时说明 end.mp3 已/将播放，跳过所有中途报时
    const remaining = totalDuration - elapsed;
    if (remaining <= 10) return;

    // 检查是否有对应的音频文件
    const hintName = this.getHintFileName(elapsed);
    if (hintName) {
      this.hintPlayedSet.add(elapsed);
      this.playAudioByName(hintName);
    }
  },

  // 根据已过秒数获取提示文件名
  getHintFileName(elapsedSeconds) {
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;

    // 支持的提示时间点: 1m, 1m30s, 2m, 2m30s, 3m, 3m30s, 4m, 4m30s
    const supportedTimes = {
      '60': 'pb_hint_1m',
      '90': 'pb_hint_1m30s',
      '120': 'pb_hint_2m',
      '150': 'pb_hint_2m30s',
      '180': 'pb_hint_3m',
      '210': 'pb_hint_3m30s',
      '240': 'pb_hint_4m',
      '270': 'pb_hint_4m30s'
    };

    return supportedTimes[String(elapsedSeconds)] || null;
  },

  // ==================== 挑战完成 ====================
  completeChallenge() {
    this.setData({ state: STATE.COMPLETED, countdown: 0 });
    this.saveRecord('completed', this.data.totalDuration);
  },

  // ==================== 停止挑战 ====================
  stopChallenge() {
    wx.showModal({
      title: '确认终止',
      content: '确定要终止当前挑战吗？',
      success: (res) => {
        if (res.confirm) {
          this.stopTimer();
          this.playAudioByName('pb_stop');
          this.setData({ state: STATE.STOPPED });
          this.saveRecord('stopped', this.elapsedSeconds);
        }
      }
    });
  },

  // ==================== 保存记录 ====================
  saveRecord(status, actualDuration) {
    const { totalDuration } = this.data;
    const minutes = Math.floor(totalDuration / 60);
    const seconds = totalDuration % 60;
    wx.cloud.callFunction({
      name: 'planFunctions',
      data: {
        action: 'savePBRecord',
        data: {
          minutes,
          seconds,
          totalDuration,
          actualDuration,
          status
        }
      }
    }).then(() => {
      console.log('PB记录已保存');
    }).catch(err => {
      console.error('保存PB记录失败', err);
    });
  },

  // ==================== 返回 ====================
  returnToChallenge() {
    wx.navigateBack();
  },

  // ==================== 工具 ====================
  stopTimer() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
});
