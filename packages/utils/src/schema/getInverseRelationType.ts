export const getInverseRelationType = (relationType: "OneToOne" | "OneToMany" | "ManyToOne" | "ManyToMany") => {
    if (relationType === "OneToOne") {
        return "OneToOne"
    }
    if (relationType === "OneToMany") {
        return "ManyToOne"
    }
    if (relationType === "ManyToOne") {
        return "OneToMany"
    }
    if (relationType === "ManyToMany") {
        return "ManyToMany"
    }
    return "OneToOne"
}
