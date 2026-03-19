function buildSlotsTree(slots) {
  const dateMap = {};
  slots.forEach(slot => {
    const date = new Date(slot.startTime);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateKey = `${date.getFullYear()}-${month}-${day}`;
    const dateLabel = `${month}月${day}日`;
    const startHours = String(date.getHours()).padStart(2, '0');
    const startMinutes = String(date.getMinutes()).padStart(2, '0');
    const endDate = new Date(date.getTime() + slot.durationMinutes * 60000);
    const endHours = String(endDate.getHours()).padStart(2, '0');
    const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
    const availability = slot.status === 'active' ? '可报名' : '不可报名';
    const timeLabel = `${startHours}:${startMinutes} - ${endHours}:${endMinutes}（${availability}）`;

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
    slotsTree: [],
    treeSelectKeys: { label: 'label', value: 'value', children: 'children' }
  },

  onLoad(options) {
    // TODO: 开发调试用，上线前删除
    const expId = options.id || '7a85e5d469bb9bf6000a16d82d1d15c3';

    if (!expId) {
      console.error('expDetail: 缺少 id 参数', options);
      wx.showToast({ title: '参数错误', icon: 'error' });
      return;
    }

    const db = wx.cloud.database();
    db.collection('Experiments').doc(expId).get({
      success: (res) => {
        const exp = res.data;
        this.setData({ exp });
        this._loadSlots(db, exp.slotIds);
      },
      fail: (err) => {
        console.error('获取实验失败', err);
        wx.showToast({ title: '加载失败', icon: 'error' });
      }
    });
  },

  _loadSlots(db, slotIds) {
    if (!Array.isArray(slotIds) || slotIds.length === 0) return;

    Promise.all(slotIds.map(id => db.collection('Slots').doc(id).get()))
      .then(results => {
        const slots = results.map(r => r.data);
        this.setData({ slotsTree: buildSlotsTree(slots) });
      })
      .catch(err => {
        console.error('获取时间段失败', err);
      });
  },

  handleApply() {
    wx.navigateTo({
      url: `/pages/expSignUp/expSignUp?id=${this.data.exp._id}`
    });
  }
});
