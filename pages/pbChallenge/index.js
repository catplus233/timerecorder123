// pages/pbChallenge/index.js
const app = getApp();

Page({
  data: {
    minutes: 2,
    seconds: 0,
    totalDisplay: '2 分 00 秒',
    loading: false
  },

  onLoad() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库');
    } else {
      wx.cloud.init({
        env: app.globalData.env,
        traceUser: true,
      });
    }
  },

  onShow() {
    this.loadLastRecord();
  },

  // 加载上次 PB 记录作为默认值
  loadLastRecord() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'planFunctions',
      data: { action: 'getPBRecord' }
    }).then(res => {
      if (res.result && res.result.data && res.result.data.totalDuration) {
        const total = res.result.data.totalDuration;
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        this.setTime(minutes, seconds);
      }
      this.setData({ loading: false });
    }).catch(err => {
      console.error('加载PB记录失败', err);
      this.setData({ loading: false });
    });
  },

  // 设置时间并更新显示
  setTime(minutes, seconds) {
    this.setData({
      minutes,
      seconds,
      totalDisplay: this.formatTime(minutes, seconds)
    });
  },

  formatTime(m, s) {
    return m + ' 分 ' + String(s).padStart(2, '0') + ' 秒';
  },

  // 分钟步进器 - 减少
  decreaseMinutes() {
    const m = this.data.minutes;
    if (m > 1) {
      this.setTime(m - 1, this.data.seconds);
    }
  },

  // 分钟步进器 - 增加
  increaseMinutes() {
    const m = this.data.minutes;
    if (m < 4) {
      this.setTime(m + 1, this.data.seconds);
    }
  },

  // 秒数步进器 - 减少（步长5）
  decreaseSeconds() {
    const s = this.data.seconds;
    if (s > 0) {
      this.setTime(this.data.minutes, s - 5);
    } else if (this.data.minutes > 1) {
      this.setTime(this.data.minutes - 1, 55);
    }
  },

  // 秒数步进器 - 增加（步长5）
  increaseSeconds() {
    const s = this.data.seconds;
    if (s < 55) {
      this.setTime(this.data.minutes, s + 5);
    } else if (this.data.minutes < 4) {
      this.setTime(this.data.minutes + 1, 0);
    }
  },

  // 开始挑战
  startChallenge() {
    const { minutes, seconds } = this.data;
    if (minutes < 1 || (minutes === 1 && seconds === 0)) {
      wx.showToast({ title: '挑战时长至少1分钟', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/pbExecute/index?minutes=${minutes}&seconds=${seconds}`
    });
  }
});
