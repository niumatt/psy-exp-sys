App({
  globalData: {
    subjectId: null,
    openid: null,
    answeredExpIds: {},
    pendingAnsweredExpId: null,
    pendingQuestionaryId: null
  },

  onLaunch() {
    wx.cloud.init({ traceUser: true });

    // 查询当前用户的 Subject 记录（云数据库自动按 _openid 过滤）
    const db = wx.cloud.database();
    db.collection('Subjects').get({
      success: (res) => {
        if (res.data.length > 0) {
          const subject = res.data[0];
          this.globalData.subjectId = subject._id;
          this.globalData.openid = subject._openid;
          console.log('当前用户姓名：', subject.realName);
        }
      },
      fail: (err) => {
        console.error('获取 Subject 失败', err);
      }
    });
  },

  onShow(options) {
    if (options.scene !== 1038) return;

    const extraData = options.referrerInfo && options.referrerInfo.extraData;
    if (!(extraData && extraData.status === 'answered')) return;

    const { pendingAnsweredExpId, pendingQuestionaryId, openid } = this.globalData;
    if (!pendingQuestionaryId || !openid) return;

    // 将当前用户写入 QuestionaryRecords.finishedSubjects（云函数保证有写权限）
    wx.cloud.callFunction({
      name: 'markSurveyFinished',
      data: { questionaryId: pendingQuestionaryId }
    });

    this.globalData.answeredExpIds[pendingAnsweredExpId] = true;
    this.globalData.pendingAnsweredExpId = null;
    this.globalData.pendingQuestionaryId = null;
  }
});
