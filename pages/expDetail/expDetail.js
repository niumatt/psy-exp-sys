// 腾讯问卷：https://wj.qq.com/s2/{sid}/{hash}/
function parseTxwjUrl(url) {
  const parts = url.replace(/\/$/, '').split('/');
  return {
    sid: parts[parts.length - 2],
    hash: parts[parts.length - 1]
  };
}

Page({
  data: {
    exp: null,
    questionary: null,
    hasSurvey: false,
    surveyFilled: false,
    applyDisabled: false
  },

  onLoad(options) {
    // TODO: 开发调试用，上线前删除
    const expId = options.id || '7a85e5d469ba82ba0008628928ff984a';

    if (!expId) {
      console.error('expDetail: 缺少 id 参数', options);
      wx.showToast({ title: '参数错误', icon: 'error' });
      return;
    }

    const db = wx.cloud.database();

    db.collection('Experiments').doc(expId).get({
      success: (expRes) => {
        const exp = expRes.data;

        if (!exp.questionaryId) {
          this.setData({ exp, hasSurvey: false, applyDisabled: false });
          return;
        }

        db.collection('QuestionaryRecords').doc(exp.questionaryId).get({
          success: (qRes) => {
            const questionary = qRes.data;
            const hasSurvey = questionary.type !== 'none';
            const subjectId = getApp().globalData.subjectId;
            const surveyFilled = hasSurvey &&
              Array.isArray(questionary.finishedSubjects) &&
              questionary.finishedSubjects.includes(subjectId);

            this.setData({
              exp,
              questionary,
              hasSurvey,
              surveyFilled,
              applyDisabled: hasSurvey && !surveyFilled
            });
          },
          fail: (err) => {
            console.error('获取问卷记录失败', err);
            this.setData({ exp, hasSurvey: false, applyDisabled: false });
          }
        });
      },
      fail: (err) => {
        console.error('获取实验失败', err);
        wx.showToast({ title: '加载失败', icon: 'error' });
      }
    });
  },

  onShow() {
    if (!this.data.hasSurvey || this.data.surveyFilled) return;

    // 腾讯问卷：App.onShow 已写库，此处只更新本地状态
    const app = getApp();
    const expId = this.data.exp && this.data.exp._id;
    if (app.globalData.answeredExpIds[expId]) {
      this.setData({ surveyFilled: true, applyDisabled: false });
      return;
    }

    // 问卷星：弹框手动确认后写库
    if (this._waitingWjxReturn) {
      this._waitingWjxReturn = false;
      wx.showModal({
        title: '问卷确认',
        content: '是否已完成筛选问卷？',
        confirmText: '已完成',
        cancelText: '未完成',
        success: (res) => {
          if (!res.confirm) return;

          const subjectId = getApp().globalData.subjectId;
          const db = wx.cloud.database();
          db.collection('QuestionaryRecords').doc(this.data.questionary._id).update({
            data: {
              finishedSubjects: db.command.push(subjectId)
            }
          });

          getApp().globalData.answeredExpIds[expId] = true;
          this.setData({ surveyFilled: true, applyDisabled: false });
        }
      });
    }
  },

  handleSurvey() {
    const { type, value } = this.data.questionary;
    if (type === 'txwj') {
      const app = getApp();
      app.globalData.pendingAnsweredExpId = this.data.exp._id;
      app.globalData.pendingQuestionaryId = this.data.questionary._id;
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

  handleApply() {
    if (this.data.applyDisabled) {
      wx.showToast({ title: '请填写筛选问卷后报名', icon: 'none' });
      return;
    }

    const db = wx.cloud.database();
    db.collection('Appointments').add({
      data: {
        expId: this.data.exp._id,
        subjectId: getApp().globalData.subjectId,
        appointmentStatus: 1,
        rewardStatus: 0,
        isCanceled: 0,
        createTime: db.serverDate()
      },
      success: () => {
        wx.showToast({ title: '报名成功', icon: 'success' });
      },
      fail: (err) => {
        console.error('报名失败', err);
        wx.showToast({ title: '报名失败，请重试', icon: 'error' });
      }
    });
  }
});
