
export type AsObject<A> = A extends object ? A : never;
export type $Keys<T extends object> = keyof T;

export type SetDifference<A, B> = A extends B ? never : A;
export type SetComplement<A, A1 extends A> = SetDifference<A, A1>;
export type $Diff<T extends U, U extends object> = Pick<
  T,
  SetComplement<keyof T, keyof U>
>;
export type SymmetricDifference<A, B> = SetDifference<A | B, A & B>;

export type $MaybeDiff<T, U extends object> = T extends U? $Diff<T, U> : T;
