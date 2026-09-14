const { updateOmissionsField, mainGeneric } = require("../lib/omissions-update");
const FIELDS = ["architecture","componentRelations","designDecisions"];
if (require.main === module) mainGeneric(FIELDS, "add-omissions-rfc-architecture", "rfcUnderstanding");
module.exports = { FIELDS };
