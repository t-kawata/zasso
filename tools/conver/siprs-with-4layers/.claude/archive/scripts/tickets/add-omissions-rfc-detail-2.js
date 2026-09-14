const { updateOmissionsField, mainGeneric } = require("../lib/omissions-update");
const FIELDS = ["testRequirements","errorHandling","configuration"];
if (require.main === module) mainGeneric(FIELDS, "add-omissions-rfc-detail-2", "rfcUnderstanding");
module.exports = { FIELDS };
