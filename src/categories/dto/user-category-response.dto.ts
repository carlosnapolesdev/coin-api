export interface UserCategoryResponseDto {
  id: number;
  name: string;
  type: string;
  icon: string | null;
  parentId: number | null;
  sourceCategoryId: number | null;
  active: boolean;
  custom: boolean;
  children: UserCategoryResponseDto[];
}
