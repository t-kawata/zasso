const { updateOmissionsField, mainGeneric } = require("../lib/omissions-update");
const FIELDS = ["typeDefinitions","apiSignatures","dependencyGraph","externalDependencies"];
if (require.main === module) mainGeneric(FIELDS, "add-omissions-rfc-detail-1", "rfcUnderstanding");
module.exports = { FIELDS };
