// pages/index/index.js
const app = getApp();

Page({
  data: {
    plans: [],
    loading: true
  },

  onLoad() {
    this.initCloud();
  },

  onShow() {
    this.loadPlans();
  },

  initCloud() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库');
    } else {
      wx.cloud.init({
        env: app.globalData.env,
        traceUser: true,
      });
    }
  },

  loadPlans() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'planFunctions',
      data: { action: 'getPlans' }
    }).then(res => {
      // 预计算每个计划的总时长
      const plans = res.result.data.map(plan => ({
        ...plan,
        totalTime: this.calculateTotalTime(plan)
      }));
      this.setData({
        plans,
        loading: false
      });
    }).catch(err => {
      console.error('加载计划失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  createPlan() {
    wx.navigateTo({ url: '/pages/planEditor/index' });
  },

  editPlan(e) {
    const planId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/planEditor/index?planId=${planId}` });
  },

  deletePlan(e) {
    const planId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个训练计划吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'planFunctions',
            data: { action: 'deletePlan', planId }
          }).then(() => {
            wx.showToast({ title: '已删除' });
            this.loadPlans();
          }).catch(err => {
            console.error('删除失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  startTraining(e) {
    const planId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/training/index?planId=${planId}` });
  },

  calculateTotalTime(plan) {
    const prep = plan.preparationTime || 60;
    const groups = plan.groups || [];
    let total = prep;
    groups.forEach((g, i) => {
      total += g.holdTime || 0;
      if (i < groups.length - 1) {
        total += g.restTime || 0;
      }
    });
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
});
