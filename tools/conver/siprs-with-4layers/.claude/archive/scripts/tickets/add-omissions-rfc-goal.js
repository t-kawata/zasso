const { updateOmissionsField, mainGeneric } = require("../lib/omissions-update");
const FIELDS = ["purpose","goals","successCriteria","nonScope"];
if (require.main === module) mainGeneric(FIELDS, "add-omissions-rfc-goal", "rfcUnderstanding");
module.exports = { FIELDS };
