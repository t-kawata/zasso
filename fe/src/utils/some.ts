import editions from "../../../editions.json";
import { EDITION_KEY } from "src/configs/settings";

interface EditionConfig {
  display_name: string;
  slug: string;
  identifier: string;
  data_dir: string;
  repo: string;
  icon_path: string;
  app_caption: string;
  logo_img_src: string;
  logo_img_white_src: string;
}

type EditionsMap = typeof editions;

function resolveEditionPath(path: string): string {
  return path.replace("${PUBLIC_PATH}/", import.meta.env.BASE_URL);
}

export function getCurrentEdition(): EditionConfig {
  const key = EDITION_KEY as keyof EditionsMap;
  const edition = editions[key] as EditionConfig | undefined;
  if (!edition) {
    throw new Error(`Unknown edition key: ${EDITION_KEY}`);
  }
  return {
    ...edition,
    logo_img_white_src: resolveEditionPath(edition.logo_img_white_src),
    logo_img_src: resolveEditionPath(edition.logo_img_src),
  };
}
