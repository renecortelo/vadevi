/**
 * The structure of the library's aroma vocabulary, which the grape cards, the
 * aroma wheel and the tasting picker share: families, the groups within them,
 * and each aroma, three levels deep. The aromas are the library's own terms
 * (`data/kb/terms.json`, where each has its name in the eight languages);
 * this gives each its place. Where the tasting ontology already has the
 * aroma, the code is the same.
 */
export type AromaFamilyId =
  "earth" | "floral" | "fruit" | "herbal" | "nut" | "oak" | "savoury" | "spice" | "sweet";

export type AromaDescriptor = {
  code: string;
  family: AromaFamilyId;
  group: string;
  /** The library's term for it, as `data/kb/terms.json` keys it. */
  term: string;
};

/** Families in the wheel's order, around from fruit. */
export const aromaFamilies: readonly AromaFamilyId[] = [
  "fruit",
  "floral",
  "herbal",
  "spice",
  "earth",
  "oak",
  "nut",
  "sweet",
  "savoury",
];

/** Groups in the wheel's order, each in its family. */
export const aromaGroups: readonly { family: AromaFamilyId; id: string }[] = [
  { family: "fruit", id: "fruit_red" },
  { family: "fruit", id: "fruit_black" },
  { family: "fruit", id: "fruit_citrus" },
  { family: "fruit", id: "fruit_orchard" },
  { family: "fruit", id: "fruit_stone" },
  { family: "fruit", id: "fruit_tropical" },
  { family: "fruit", id: "fruit_dried" },
  { family: "fruit", id: "fruit_other" },
  { family: "floral", id: "floral" },
  { family: "herbal", id: "herbal_herbs" },
  { family: "herbal", id: "herbal_vegetal" },
  { family: "spice", id: "spice" },
  { family: "earth", id: "earth_earth" },
  { family: "earth", id: "earth_mineral" },
  { family: "oak", id: "oak_wood" },
  { family: "oak", id: "oak_toast" },
  { family: "nut", id: "nut" },
  { family: "sweet", id: "sweet" },
  { family: "savoury", id: "savoury_animal" },
  { family: "savoury", id: "savoury_savoury" },
];

const rows: readonly (readonly [code: string, group: string, term: string])[] = [
  ["fruit.red.raspberry", "fruit_red", "raspberry"],
  ["fruit.red.strawberry", "fruit_red", "strawberry"],
  ["fruit.red.cherry", "fruit_red", "cherry"],
  ["fruit.red.sour_cherry", "fruit_red", "sour cherry"],
  ["fruit.red.red_berries", "fruit_red", "red berry"],
  ["fruit.red.red_fruit", "fruit_red", "red fruit"],
  ["fruit.red.pomegranate", "fruit_red", "pomegranate"],
  ["fruit.red.wild_berries", "fruit_red", "wild berries"],
  ["fruit.black.blackberry", "fruit_black", "blackberry"],
  ["fruit.black.plum", "fruit_black", "plum"],
  ["fruit.black.black_cherry", "fruit_black", "black cherry"],
  ["fruit.black.blackcurrant", "fruit_black", "blackcurrant"],
  ["fruit.black.black_fruit", "fruit_black", "black fruit"],
  ["fruit.black.blueberry", "fruit_black", "blueberry"],
  ["fruit.black.mulberry", "fruit_black", "mulberry"],
  ["fruit.black.damson", "fruit_black", "damson"],
  ["fruit.black.blue_fruit", "fruit_black", "blue fruit"],
  ["fruit.citrus.citrus", "fruit_citrus", "citrus"],
  ["fruit.citrus.lemon", "fruit_citrus", "lemon"],
  ["fruit.citrus.lime", "fruit_citrus", "lime"],
  ["fruit.citrus.grapefruit", "fruit_citrus", "grapefruit"],
  ["citrus.peel.orange", "fruit_citrus", "orange peel"],
  ["fruit.citrus.blood_orange", "fruit_citrus", "blood orange"],
  ["fruit.citrus.candied_lemon_peel", "fruit_citrus", "candied lemon peel"],
  ["fruit.orchard.apple", "fruit_orchard", "apple"],
  ["fruit.orchard.green_apple", "fruit_orchard", "green apple"],
  ["fruit.orchard.pear", "fruit_orchard", "pear"],
  ["fruit.orchard.quince", "fruit_orchard", "quince"],
  ["fruit.stone.peach", "fruit_stone", "peach"],
  ["fruit.stone.apricot", "fruit_stone", "apricot"],
  ["fruit.stone.greengage", "fruit_stone", "greengage"],
  ["fruit.stone.stone_fruit", "fruit_stone", "stone fruit"],
  ["fruit.tropical.tropical_fruit", "fruit_tropical", "tropical fruit"],
  ["fruit.tropical.exotic_fruit", "fruit_tropical", "exotic fruit"],
  ["fruit.tropical.banana", "fruit_tropical", "banana"],
  ["fruit.tropical.mango", "fruit_tropical", "mango"],
  ["fruit.tropical.lychee", "fruit_tropical", "lychee"],
  ["fruit.tropical.passion_fruit", "fruit_tropical", "passion fruit"],
  ["fruit.tropical.pineapple", "fruit_tropical", "pineapple"],
  ["fruit.tropical.guava", "fruit_tropical", "guava"],
  ["fruit.tropical.melon", "fruit_tropical", "melon"],
  ["fruit.dried.raisin", "fruit_dried", "raisin"],
  ["fruit.dried.fig", "fruit_dried", "fig"],
  ["fruit.dried.prune", "fruit_dried", "prune"],
  ["fruit.dried.dried_fruit", "fruit_dried", "dried fruit"],
  ["fruit.dried.apricot", "fruit_dried", "dried apricot"],
  ["fruit.dried.apple", "fruit_dried", "dried apple"],
  ["fruit.dried.jam", "fruit_dried", "jammy"],
  ["fruit.other.fruity", "fruit_other", "fruity"],
  ["fruit.other.grape", "fruit_other", "grape"],
  ["fruit.other.ripe_fruit", "fruit_other", "ripe fruit"],
  ["fruit.other.gooseberry", "fruit_other", "gooseberry"],
  ["floral.floral", "floral", "floral"],
  ["floral.violet", "floral", "violet"],
  ["floral.rose", "floral", "rose"],
  ["floral.jasmine", "floral", "jasmine"],
  ["floral.elderflower", "floral", "elderflower"],
  ["floral.acacia", "floral", "acacia"],
  ["floral.hawthorn", "floral", "hawthorn blossom"],
  ["floral.buttercup", "floral", "buttercup"],
  ["floral.lilac", "floral", "lilac"],
  ["floral.honeysuckle", "floral", "honeysuckle"],
  ["floral.musk", "floral", "musk"],
  ["floral.pollen", "floral", "pollen"],
  ["herbal.herbs", "herbal_herbs", "herbs"],
  ["herbal.herbaceous", "herbal_herbs", "herbaceous"],
  ["herbal.grass", "herbal_herbs", "grass"],
  ["herbal.mint", "herbal_herbs", "mint"],
  ["herbal.sage", "herbal_herbs", "sage"],
  ["herbal.thyme", "herbal_herbs", "thyme"],
  ["herbal.dill", "herbal_herbs", "dill"],
  ["herbal.eucalyptus", "herbal_herbs", "eucalyptus"],
  ["herbal.angelica", "herbal_herbs", "angelica"],
  ["herbal.nettle", "herbal_herbs", "nettles"],
  ["herbal.boxwood", "herbal_herbs", "boxwood"],
  ["herbal.tea", "herbal_herbs", "tea"],
  ["herbal.hops", "herbal_herbs", "hops"],
  ["herbal.vegetal", "herbal_vegetal", "vegetal"],
  ["herbal.bell_pepper", "herbal_vegetal", "bell pepper"],
  ["herbal.asparagus", "herbal_vegetal", "asparagus"],
  ["herbal.celery", "herbal_vegetal", "celery"],
  ["herbal.garlic", "herbal_vegetal", "garlic"],
  ["herbal.olive", "herbal_vegetal", "olive"],
  ["herbal.arugula", "herbal_vegetal", "arugula"],
  ["spice.spice", "spice", "spice"],
  ["spice.black_pepper", "spice", "black pepper"],
  ["spice.white_pepper", "spice", "white pepper"],
  ["spice.cinnamon", "spice", "cinnamon"],
  ["spice.anise", "spice", "anise"],
  ["spice.liquorice", "spice", "liquorice"],
  ["spice.gingerbread", "spice", "gingerbread"],
  ["earth.earthy", "earth_earth", "earthy"],
  ["earth.truffle", "earth_earth", "truffle"],
  ["mineral.mineral", "earth_mineral", "mineral"],
  ["mineral.flint", "earth_mineral", "flint"],
  ["mineral.graphite", "earth_mineral", "graphite"],
  ["mineral.petrol", "earth_mineral", "petrol"],
  ["mineral.tar", "earth_mineral", "tar"],
  ["production.oak.oak", "oak_wood", "oak"],
  ["production.oak.vanilla", "oak_wood", "vanilla"],
  ["production.oak.cedar", "oak_wood", "cedar"],
  ["production.oak.cigar_box", "oak_wood", "cigar box"],
  ["production.toast.tobacco", "oak_toast", "tobacco"],
  ["production.toast.smoke", "oak_toast", "smoky"],
  ["production.toast.toast", "oak_toast", "toast"],
  ["production.toast.coffee", "oak_toast", "coffee"],
  ["nut.nutty", "nut", "nutty"],
  ["nut.almond", "nut", "almond"],
  ["nut.bitter_almond", "nut", "bitter almond"],
  ["nut.hazelnut", "nut", "hazelnut"],
  ["nut.walnut", "nut", "walnut"],
  ["nut.marzipan", "nut", "marzipan"],
  ["nut.pistachio", "nut", "pistachio"],
  ["sweet.honey", "sweet", "honey"],
  ["sweet.caramel", "sweet", "caramel"],
  ["sweet.chocolate", "sweet", "chocolate"],
  ["sweet.molasses", "sweet", "molasses"],
  ["sweet.barley_sugar", "sweet", "barley sugar"],
  ["sweet.carob", "sweet", "carob"],
  ["earth.leather", "savoury_animal", "leather"],
  ["savoury.game", "savoury_animal", "gamey"],
  ["savoury.savoury", "savoury_savoury", "savoury"],
  ["savoury.bitter", "savoury_savoury", "bitter"],
];

const familyOf = new Map(aromaGroups.map((group) => [group.id, group.family]));

export const aromaDescriptors: readonly AromaDescriptor[] = rows.map(([code, group, term]) => ({
  code,
  family: familyOf.get(group)!,
  group,
  term,
}));

const byTerm = new Map(aromaDescriptors.map((descriptor) => [descriptor.term, descriptor]));

/** The aroma a library term names, or null. */
export function aromaFromTerm(term: string): AromaDescriptor | null {
  return byTerm.get(term) ?? null;
}
