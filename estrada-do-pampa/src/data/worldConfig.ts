export const worldConfig={dayLength:1800,trafficDensity:1,weatherProbability:.3,animalProbability:.12,eventProbability:.15,renderDistance:2400,terrainChunkSize:512,vegetationDensity:1} as const;
export const qualityPresets={LOW:{ratio:1,shadows:false,distance:1400},MEDIUM:{ratio:1.25,shadows:true,distance:2000},HIGH:{ratio:1.6,shadows:true,distance:2800},ULTRA:{ratio:2,shadows:true,distance:3600}} as const;
export type Quality=keyof typeof qualityPresets;
