export interface CategoryCatalogResponseDto {
  id: number;
  name: string;
  type: string;
  icon: string | null;
  parentId: number | null;
  children: CategoryCatalogResponseDto[];
}
