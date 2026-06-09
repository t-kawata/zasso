import editions from "../../../editions.json";
import { EDITION_SLUG } from "src/configs/settings";

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
  const key = EDITION_SLUG as keyof EditionsMap;
  const edition = editions[key] as EditionConfig | undefined;
  if (!edition) {
    throw new Error(`Unknown edition key: ${EDITION_SLUG}`);
  }
  return {
    ...edition,
    logo_img_white_src: resolveEditionPath(edition.logo_img_white_src),
    logo_img_src: resolveEditionPath(edition.logo_img_src),
  };
}

/** 現在のエディションが zasso である場合に true を返す */
export function isZasso(): boolean {
  return (EDITION_SLUG as string) === editions.zasso.slug;
}

/** 現在のエディションが MYCUTE である場合に true を返す */
export function isMycute(): boolean {
  return (EDITION_SLUG as string) === editions.mycute.slug;
}

/** 現在のエディションが NECO-ASOVI である場合に true を返す */
export function isNecoAsovi(): boolean {
  return (EDITION_SLUG as string) === editions["neco-asovi"].slug;
}

/** 指定されたミリ秒だけ待機する */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
