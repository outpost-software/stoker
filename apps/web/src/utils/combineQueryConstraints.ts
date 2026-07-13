import { and, QueryConstraint, QueryFilterConstraint } from "firebase/firestore"

export const combineQueryConstraints = (constraints: QueryConstraint[]): QueryConstraint[] => {
    const hasCompositeFilter = constraints.some((constraint) => {
        const type = (constraint as { type?: string }).type
        return type === "or" || type === "and"
    })
    if (!hasCompositeFilter || constraints.length <= 1) return constraints
    return [and(...(constraints as unknown as QueryFilterConstraint[])) as unknown as QueryConstraint]
}
