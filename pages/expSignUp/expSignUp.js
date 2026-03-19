// 腾讯问卷：https://wj.qq.com/s2/{sid}/{hash}/
function parseTxwjUrl(url) {
  const parts = url.replace(/\/$/, '').split('/');
  return {
    sid: parts[parts.length - 2],
    hash: parts[parts.length - 1]
  };
}

function buildSlotsTree(slots) {
  const dateMap = {};
  slots.forEach(slot => {
    const date = new Date(slot.startTime);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateKey = `${date.getFullYear()}-${month}-${day}`;
    const dateLabel = `${month}月${day}日`;
    const startH = String(date.getHours()).padStart(2, '0');
    const startM = String(date.getMinutes()).padStart(2, '0');
    const endDate = new Date(date.getTime() + slot.durationMinutes * 60000);
    const endH = String(endDate.getHours()).padStart(2, '0');
    const endM = String(endDate.getMinutes()).padStart(2, '0');
    const availability = slot.status === 'active' ? '可报名' : '不可报名';
    const timeLabel = `${startH}:${startM} - ${endH}:${endM}（${availability}）`;

    if (!dateMap[dateKey]) {
      dateMap[dateKey] = { label: dateLabel, value: dateKey, children: [] };
    }
    dateMap[dateKey].children.push({
      label: timeLabel,
      value: slot._id,
      disabled: slot.status !== 'active'
    });
  });
  return Object.keys(dateMap).sort().map(k => dateMap[k]);
}

Page({
  data: {
    exp: null,
    questionary: null,
    hasSurvey: false,
    surveyFilled: false,
    hasCriteria: false,
    criteriaConfirmed: false,
    checkedCriteria: [],
    popupVisible: false,
    slotsTree: [],
    slotPopupVisible: false,
    activeDateIndex: 0,
    selectedSlotId: null,
    selectedSlotLabel: ''
  },

  onLoad(options) {
    const expId = options.id;
    if (!expId) {
      wx.showToast({ title: '参数错误', icon: 'error' });
      return;
    }

    const db = wx.cloud.database();
    db.collection('Experiments').doc(expId).get({
      success: (expRes) => {
        const exp = expRes.data;
        const hasCriteria = Array.isArray(exp.criteria) && exp.criteria.length > 0;

        this._loadSlots(db, exp.slotIds);

        if (!exp.questionaryId) {
          this.setData({ exp, hasCriteria, hasSurvey: false });
          return;
        }

        db.collection('QuestionaryRecords').doc(exp.questionaryId).get({
          success: (qRes) => {
            const questionary = qRes.data;
            const hasSurvey = questionary.type !== 'none';
            const openid = getApp().globalData.openid;
            const surveyFilled = hasSurvey &&
              Array.isArray(questionary.finishedSubjects) &&
              questionary.finishedSubjects.includes(openid);

            this.setData({ exp, questionary, hasCriteria, hasSurvey, surveyFilled });
          },
          fail: (err) => {
            console.error('获取问卷记录失败', err);
            this.setData({ exp, hasCriteria, hasSurvey: false });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '加载失败', icon: 'error' });
      }
    });
  },

  _loadSlots(db, slotIds) {
    if (!Array.isArray(slotIds) || slotIds.length === 0) return;

    Promise.all(slotIds.map(id => db.collection('Slots').doc(id).get()))
      .then(results => {
        this.setData({ slotsTree: buildSlotsTree(results.map(r => r.data)) });
      })
      .catch(err => {
        console.error('获取时间段失败', err);
      });
  },

  onShow() {
    if (!this.data.hasSurvey || this.data.surveyFilled) return;

    const app = getApp();
    const expId = this.data.exp && this.data.exp._id;

    if (this._waitingTxwjReturn) {
      this._waitingTxwjReturn = false;
      if (app.globalData.answeredExpIds[expId]) {
        this.setData({ surveyFilled: true });
        return;
      }
      this._showManualConfirm(expId);
      return;
    }

    if (this._waitingWjxReturn) {
      this._waitingWjxReturn = false;
      this._showManualConfirm(expId);
    }
  },

  _showManualConfirm(expId) {
    wx.showModal({
      title: '问卷确认',
      content: '是否已完成筛选问卷？',
      confirmText: '已完成',
      cancelText: '未完成',
      success: (res) => {
        if (!res.confirm) return;
        wx.cloud.callFunction({
          name: 'markSurveyFinished',
          data: { questionaryId: this.data.questionary._id }
        });
        getApp().globalData.answeredExpIds[expId] = true;
        this.setData({ surveyFilled: true });
      }
    });
  },

  handleSurvey() {
    const { type, value } = this.data.questionary;
    if (type === 'txwj') {
      const app = getApp();
      app.globalData.pendingAnsweredExpId = this.data.exp._id;
      app.globalData.pendingQuestionaryId = this.data.questionary._id;
      this._waitingTxwjReturn = true;
      const { sid, hash } = parseTxwjUrl(value);
      wx.openEmbeddedMiniProgram({
        appId: 'wxebadf544ddae62cb',
        path: `pages/webview/index?sid=${sid}&hash=${hash}&navigateBackMiniProgram=true`
      });
    } else if (type === 'wjx') {
      this._waitingWjxReturn = true;
      wx.openEmbeddedMiniProgram({
        appId: 'wxd947200f82267e58',
        path: `pages/wjxqList/wjxqList?activityId=${value}`
      });
    }
  },

  // 实验须知 popup
  openCriteria() {
    this.setData({ popupVisible: true });
  },

  onVisibleChange(e) {
    this.setData({ popupVisible: e.detail.visible });
  },

  onCriteriaChange(e) {
    const checkedCriteria = e.detail.value;
    const total = this.data.exp.criteria.length;
    this.setData({
      checkedCriteria,
      criteriaConfirmed: checkedCriteria.length >= total ? this.data.criteriaConfirmed : false
    });
  },

  cancelCriteria() {
    this.setData({ popupVisible: false });
  },

  confirmCriteria() {
    const total = this.data.exp.criteria.length;
    if (this.data.checkedCriteria.length < total) {
      wx.showToast({ title: '请确认所有实验须知', icon: 'none' });
      return;
    }
    this.setData({ criteriaConfirmed: true, popupVisible: false });
  },

  // 时间选择 popup
  openSlotSelect() {
    this.setData({ slotPopupVisible: true });
  },

  onSlotPopupVisibleChange(e) {
    this.setData({ slotPopupVisible: e.detail.visible });
  },

  cancelSlotSelect() {
    this.setData({ slotPopupVisible: false });
  },

  onDateSelect(e) {
    this.setData({ activeDateIndex: e.currentTarget.dataset.index });
  },

  onSlotSelect(e) {
    const slot = e.currentTarget.dataset.slot;
    if (slot.disabled) return;
    const dateNode = this.data.slotsTree[this.data.activeDateIndex];
    // slot.label 格式：HH:mm - HH:mm（可报名），去掉括号部分用于 cell note 展示
    const timeRange = slot.label.replace(/（.*）$/, '').trim();
    this.setData({
      selectedSlotId: slot.value,
      selectedSlotLabel: `${dateNode.label} ${timeRange}`
    });
  },

  confirmSlotSelect() {
    if (!this.data.selectedSlotId) {
      wx.showToast({ title: '请选择时间段', icon: 'none' });
      return;
    }
    this.setData({ slotPopupVisible: false });
  },

  handleApply() {
    const db = wx.cloud.database();
    const data = {
      expId: this.data.exp._id,
      subjectId: getApp().globalData.subjectId,
      appointmentStatus: 1,
      rewardStatus: 0,
      isCanceled: 0,
      createTime: db.serverDate()
    };
    if (this.data.selectedSlotId) {
      data.slotId = this.data.selectedSlotId;
    }

    db.collection('Appointments').add({
      data,
      success: () => {
        wx.showToast({ title: '报名成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      },
      fail: (err) => {
        console.error('报名失败', err);
        wx.showToast({ title: '报名失败，请重试', icon: 'error' });
      }
    });
  }
});
