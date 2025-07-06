export interface Property {
  id: string;
  environment: string;
  key: string;
  value: string;
  description?: string;
  component: string;
  lastModified: Date;
  // Order preservation fields
  environmentOrder?: number;
  fileOrder?: number;
  lineOrder?: number;
}

export interface Environment {
  name: string;
  properties: Property[];
}

export interface PropertyFilter {
  environment?: string;
  searchTerm?: string;
}

export type EnvironmentType = 'batch' | 'f4batch' | 'index' | 'webapp';