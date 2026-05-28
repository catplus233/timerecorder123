// pages/planEditor/index.js
const app = getApp();

// 时间步长配置
const STEP_CONFIG = {
  prep: { step: 10, min: 30, max: 300 },  // 调息：步长10s，最小30s，最大300s
  hold: { step: 5, min: 15, max: 300 },   // 闭气：步长5s，最小15s，最大300s
  rest: { step: 5, min: 15, max: 300 }    // 休息：步长5s，最小15s，最大300s
};

Page({
  data: {
    planId: '',
    planName: '',
    preparationTime: 60,
    groups: [],
    totalTime: '0:00',
    isEditing: false
  },

  // 会话级默认值记忆
  sessionDefaults: {
    lastHoldTime: null,
    lastRestTime: null
  },

  onLoad(options) {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库');
    } else {
      wx.cloud.init({
        env: app.globalData.env,
        traceUser: true,
      });
    }

    if (options.planId) {
      this.setData({ isEditing: true, planId: options.planId });
      this.loadPlan(options.planId);
    } else {
      // 新建计划：初始化1组
      this.addGroup();
    }
  },

  loadPlan(planId) {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'planFunctions',
      data: { action: 'getPlan', planId }
    }).then(res => {
      wx.hideLoading();
      const plan = res.result.data;
      this.setData({
        planName: plan.planName,
        preparationTime: plan.preparationTime,
        groups: plan.groups
      });
      this.calculateTotalTime();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
      console.error(err);
    });
  },

  onPlanNameChange(e) {
    this.setData({ planName: e.detail.value });
  },

  // 步进器减
  onStepperMinus(e) {
    const { type, index } = e.currentTarget.dataset;
    const config = STEP_CONFIG[type];

    if (type === 'prep') {
      let value = this.data.preparationTime - config.step;
      value = Math.max(value, config.min);
      this.setData({ preparationTime: value });
    } else {
      const groups = this.data.groups;
      if (type === 'hold') {
        let value = (groups[index].holdTime || 30) - config.step;
        value = Math.max(value, config.min);
        groups[index].holdTime = value;
        this.sessionDefaults.lastHoldTime = value;
      } else if (type === 'rest') {
        let value = (groups[index].restTime || 30) - config.step;
        value = Math.max(value, config.min);
        groups[index].restTime = value;
        this.sessionDefaults.lastRestTime = value;
      }
      this.setData({ groups });
    }
    this.calculateTotalTime();
  },

  // 步进器加
  onStepperPlus(e) {
    const { type, index } = e.currentTarget.dataset;
    const config = STEP_CONFIG[type];

    if (type === 'prep') {
      let value = this.data.preparationTime + config.step;
      value = Math.min(value, config.max);
      this.setData({ preparationTime: value });
    } else {
      const groups = this.data.groups;
      if (type === 'hold') {
        let value = (groups[index].holdTime || 30) + config.step;
        value = Math.min(value, config.max);
        groups[index].holdTime = value;
        this.sessionDefaults.lastHoldTime = value;
      } else if (type === 'rest') {
        let value = (groups[index].restTime || 30) + config.step;
        value = Math.min(value, config.max);
        groups[index].restTime = value;
        this.sessionDefaults.lastRestTime = value;
      }
      this.setData({ groups });
    }
    this.calculateTotalTime();
  },

  // 步进器输入
  onStepperInput(e) {
    const { type, index } = e.currentTarget.dataset;
    let value = parseInt(e.detail.value) || 0;
    const config = STEP_CONFIG[type];

    // 限制范围
    value = Math.max(config.min, Math.min(config.max, value));

    if (type === 'prep') {
      this.setData({ preparationTime: value });
    } else {
      const groups = this.data.groups;
      if (type === 'hold') {
        groups[index].holdTime = value;
        this.sessionDefaults.lastHoldTime = value;
      } else if (type === 'rest') {
        groups[index].restTime = value;
        this.sessionDefaults.lastRestTime = value;
      }
      this.setData({ groups });
    }
    this.calculateTotalTime();
  },

  // 添加新组，使用会话级默认值
  addGroup() {
    const groups = this.data.groups;
    const newGroup = {
      groupIndex: groups.length + 1,
      holdTime: this.sessionDefaults.lastHoldTime || 30,
      restTime: this.sessionDefaults.lastRestTime || 30
    };

    groups.push(newGroup);
    this.setData({ groups });
    this.calculateTotalTime();
  },

  // 删除组
  deleteGroup(e) {
    const index = e.currentTarget.dataset.index;
    let groups = this.data.groups;

    if (groups.length <= 1) return;

    groups.splice(index, 1);
    // 重新编号
    groups = groups.map((g, i) => ({ ...g, groupIndex: i + 1 }));
    this.setData({ groups });
    this.calculateTotalTime();
  },

  // 判断是否是最后一组
  isLastGroup(index) {
    return parseInt(index) === this.data.groups.length - 1;
  },

  // 计算总时长
  calculateTotalTime() {
    const prep = this.data.preparationTime;
    const groups = this.data.groups;
    let total = prep;
    groups.forEach((g, i) => {
      total += g.holdTime || 0;
      if (i < groups.length - 1) {
        total += g.restTime || 0;
      }
    });
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    this.setData({ totalTime: `${mins}:${String(secs).padStart(2, '0')}` });
  },

  // 保存计划
  savePlan() {
    const { planName, preparationTime, groups, isEditing, planId } = this.data;

    if (!planName.trim()) {
      wx.showToast({ title: '请输入计划名称', icon: 'none' });
      return;
    }

    if (groups.length === 0) {
      wx.showToast({ title: '至少需要1组训练', icon: 'none' });
      return;
    }

    const planData = {
      planName: planName.trim(),
      preparationTime,
      groups
    };

    wx.showLoading({ title: '保存中...' });

    const action = isEditing ? 'updatePlan' : 'createPlan';
    const params = isEditing
      ? { action, planId, data: planData }
      : { action, data: planData };

    wx.cloud.callFunction({
      name: 'planFunctions',
      data: params
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '保存成功' });
      setTimeout(() => wx.navigateBack(), 1000);
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
      console.error(err);
    });
  }
});
