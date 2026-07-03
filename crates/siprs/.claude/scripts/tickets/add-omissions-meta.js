const { updateOmissionsField, mainGeneric } = require("../lib/omissions-update");
const FIELDS = ["summary"];
if (require.main === module) mainGeneric(FIELDS, "add-omissions-meta");
module.exports = { FIELDS };
