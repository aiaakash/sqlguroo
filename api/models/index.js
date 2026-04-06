const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const methods = createMethods(mongoose);
const { comparePassword } = require('./userMethods');
const {
  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,
} = require('./Message');
const { getConvoTitle, getConvo, saveConvo, deleteConvos } = require('./Conversation');
const { getPreset, getPresets, savePreset, deletePresets } = require('./Preset');
const {
  getChart,
  getChartByShareId,
  getCharts,
  createChart,
  updateChart,
  updateChartData,
  deleteChart,
  permanentlyDeleteCharts,
  getChartWithData,
  duplicateChart,
} = require('./Chart');
const {
  getDashboard,
  getDashboardByShareId,
  getDashboards,
  getSharedDashboards,
  createDashboard,
  updateDashboard,
  addChartToDashboard,
  removeChartFromDashboard,
  updateDashboardLayout,
  duplicateDashboard,
  deleteDashboard,
  getDashboardWithCharts,
  getPublicDashboardWithCharts,
  toggleDashboardStar,
} = require('./Dashboard');
const { File } = require('~/db/models');

const seedDatabase = async () => {
  await methods.initializeRoles();
  await methods.seedDefaultRoles();
  await methods.ensureDefaultCategories();
};

module.exports = {
  ...methods,
  seedDatabase,
  comparePassword,

  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,

  getConvoTitle,
  getConvo,
  saveConvo,
  deleteConvos,

  getPreset,
  getPresets,
  savePreset,
  deletePresets,

  getChart,
  getChartByShareId,
  getCharts,
  createChart,
  updateChart,
  updateChartData,
  deleteChart,
  permanentlyDeleteCharts,
  getChartWithData,
  duplicateChart,

  getDashboard,
  getDashboardByShareId,
  getDashboards,
  getSharedDashboards,
  createDashboard,
  updateDashboard,
  addChartToDashboard,
  removeChartFromDashboard,
  updateDashboardLayout,
  duplicateDashboard,
  deleteDashboard,
  getDashboardWithCharts,
  getPublicDashboardWithCharts,
  toggleDashboardStar,

  Files: File,
};
