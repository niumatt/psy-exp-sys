const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { questionaryId } = event;
  const { OPENID } = cloud.getWXContext();

  if (!questionaryId) {
    return { success: false, error: 'missing questionaryId' };
  }

  await db.collection('QuestionaryRecords').doc(questionaryId).update({
    data: {
      finishedSubjects: db.command.push(OPENID)
    }
  });

  return { success: true, openid: OPENID };
};
