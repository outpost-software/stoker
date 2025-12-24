import { useState, useEffect, useRef } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./components/ui/dialog"
import { Button } from "./components/ui/button"
import { Checkbox } from "./components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import { Badge } from "./components/ui/badge"
import { CollectionSchema, StokerRole } from "@stoker-platform/types"
import { getCurrentUserPermissions, getSchema } from "@stoker-platform/web-client"

interface FilePermissionsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    collection: CollectionSchema
    filename: string
    onConfirm: (permissions: FilePermissions) => void
    onCancel: () => void
    isMultipleFileUpload: boolean
    initialPermissions?: FilePermissions
}

export interface FilePermissions {
    read: string
    update: string
    delete: string
}

export const FilePermissionsDialog = ({
    open,
    onOpenChange,
    collection,
    filename,
    onConfirm,
    onCancel,
    isMultipleFileUpload,
    initialPermissions,
}: FilePermissionsDialogProps) => {
    const schema = getSchema()
    const currentUserPermissions = getCurrentUserPermissions()
    const currentUserRole = currentUserPermissions?.Role
    if (!currentUserRole) {
        throw new Error("PERMISSION_DENIED")
    }

    const [permissions, setPermissions] = useState<FilePermissions>({
        read: "",
        update: "",
        delete: "",
    })
    const [availableRoles, setAvailableRoles] = useState<{
        read: StokerRole[]
        update: StokerRole[]
        delete: StokerRole[]
    }>({
        read: [],
        update: [],
        delete: [],
    })
    const [requiredRoles, setRequiredRoles] = useState<{
        read: Set<StokerRole>
        update: Set<StokerRole>
        delete: Set<StokerRole>
    }>({
        read: new Set(),
        update: new Set(),
        delete: new Set(),
    })
    const [selectedRoles, setSelectedRoles] = useState<{
        read: Set<StokerRole>
        update: Set<StokerRole>
        delete: Set<StokerRole>
    }>({
        read: new Set(),
        update: new Set(),
        delete: new Set(),
    })
    const [isInitialized, setIsInitialized] = useState(false)
    const intentionalCloseRef = useRef(false)

    useEffect(() => {
        if (open && !isInitialized) {
            const fileAssignment = collection.access.files?.assignment || {}

            const newRequiredRoles = {
                read: new Set<StokerRole>(),
                update: new Set<StokerRole>(),
                delete: new Set<StokerRole>(),
            }

            const newAvailableRoles = {
                read: [] as StokerRole[],
                update: [] as StokerRole[],
                delete: [] as StokerRole[],
            }

            // eslint-disable-next-line security/detect-object-injection
            if (fileAssignment[currentUserRole]) {
                // eslint-disable-next-line security/detect-object-injection
                const userAssignment = fileAssignment[currentUserRole]

                if (userAssignment.required) {
                    if (userAssignment.required.read) {
                        userAssignment.required.read.forEach((role) => {
                            newRequiredRoles.read.add(role as StokerRole)
                        })
                    }
                    if (userAssignment.required.update) {
                        userAssignment.required.update.forEach((role) => {
                            newRequiredRoles.update.add(role as StokerRole)
                        })
                    }
                    if (userAssignment.required.delete) {
                        userAssignment.required.delete.forEach((role) => {
                            newRequiredRoles.delete.add(role as StokerRole)
                        })
                    }
                }

                if (userAssignment.optional) {
                    if (userAssignment.optional.read) {
                        userAssignment.optional.read.forEach((role) => {
                            newAvailableRoles.read.push(role as StokerRole)
                        })
                    }
                    if (userAssignment.optional.update) {
                        userAssignment.optional.update.forEach((role) => {
                            newAvailableRoles.update.push(role as StokerRole)
                        })
                    }
                    if (userAssignment.optional.delete) {
                        userAssignment.optional.delete.forEach((role) => {
                            newAvailableRoles.delete.push(role as StokerRole)
                        })
                    }
                }

                newRequiredRoles.read.forEach((role) => {
                    if (!newAvailableRoles.read.includes(role)) {
                        newAvailableRoles.read.push(role)
                    }
                })
                newRequiredRoles.update.forEach((role) => {
                    if (!newAvailableRoles.update.includes(role)) {
                        newAvailableRoles.update.push(role)
                    }
                })
                newRequiredRoles.delete.forEach((role) => {
                    if (!newAvailableRoles.delete.includes(role)) {
                        newAvailableRoles.delete.push(role)
                    }
                })
            } else {
                const allRoles = schema.config.roles as StokerRole[]
                newAvailableRoles.read = [...allRoles]
                newAvailableRoles.update = [...allRoles]
                newAvailableRoles.delete = [...allRoles]
            }

            setAvailableRoles(newAvailableRoles)
            setRequiredRoles(newRequiredRoles)

            let finalPermissions: FilePermissions
            let initialSelectedRoles: {
                read: Set<StokerRole>
                update: Set<StokerRole>
                delete: Set<StokerRole>
            }

            if (initialPermissions) {
                const parseRoles = (rolesString: string): Set<StokerRole> => {
                    if (!rolesString) {
                        return new Set()
                    }
                    return new Set(rolesString.split(",").filter(Boolean) as StokerRole[])
                }

                initialSelectedRoles = {
                    read: parseRoles(initialPermissions.read),
                    update: parseRoles(initialPermissions.update),
                    delete: parseRoles(initialPermissions.delete),
                }

                // Ensure required roles are always included
                initialSelectedRoles.read = new Set([...initialSelectedRoles.read, ...newRequiredRoles.read])
                initialSelectedRoles.update = new Set([...initialSelectedRoles.update, ...newRequiredRoles.update])
                initialSelectedRoles.delete = new Set([...initialSelectedRoles.delete, ...newRequiredRoles.delete])

                finalPermissions = {
                    read: initialPermissions.read || Array.from(newRequiredRoles.read).join(","),
                    update: initialPermissions.update || Array.from(newRequiredRoles.update).join(","),
                    delete: initialPermissions.delete || Array.from(newRequiredRoles.delete).join(","),
                }
            } else {
                initialSelectedRoles = {
                    read: new Set<StokerRole>(newRequiredRoles.read),
                    update: new Set<StokerRole>(newRequiredRoles.update),
                    delete: new Set<StokerRole>(newRequiredRoles.delete),
                }

                finalPermissions = {
                    read: Array.from(newRequiredRoles.read).join(","),
                    update: Array.from(newRequiredRoles.update).join(","),
                    delete: Array.from(newRequiredRoles.delete).join(","),
                }
            }

            setSelectedRoles(initialSelectedRoles)
            setPermissions(finalPermissions)
            setIsInitialized(true)
        }
    }, [open, currentUserRole, isInitialized])

    const handleRoleToggle = (permission: "read" | "update" | "delete", role: StokerRole, checked: boolean) => {
        // eslint-disable-next-line security/detect-object-injection
        if (!checked && requiredRoles[permission].has(role)) {
            return
        }

        setSelectedRoles((prev) => {
            // eslint-disable-next-line security/detect-object-injection
            const newSelected = new Set(prev[permission])
            if (checked) {
                newSelected.add(role)
            } else {
                newSelected.delete(role)
            }

            const newSelectedRoles = {
                ...prev,
                [permission]: newSelected,
            }

            const roleString = newSelected.size > 0 ? Array.from(newSelected).join(",") : ""

            setPermissions((prevPerms) => ({
                ...prevPerms,
                // eslint-disable-next-line security/detect-object-injection
                [permission]: roleString,
            }))

            return newSelectedRoles
        })
    }

    const handleSelectAll = (permission: "read" | "update" | "delete") => {
        setSelectedRoles((prev) => {
            // eslint-disable-next-line security/detect-object-injection
            const newSelected = new Set(availableRoles[permission])
            const newSelectedRoles = {
                ...prev,
                [permission]: newSelected,
            }

            setPermissions((prevPerms) => ({
                ...prevPerms,
                // eslint-disable-next-line security/detect-object-injection
                [permission]: newSelected.size > 0 ? Array.from(newSelected).join(",") : "",
            }))

            return newSelectedRoles
        })
    }

    const handleClearAll = (permission: "read" | "update" | "delete") => {
        setSelectedRoles((prev) => {
            const newSelectedRoles = {
                ...prev,
                // eslint-disable-next-line security/detect-object-injection
                [permission]: new Set(requiredRoles[permission]),
            }

            // eslint-disable-next-line security/detect-object-injection
            const roleString = requiredRoles[permission].size > 0 ? Array.from(requiredRoles[permission]).join(",") : ""

            setPermissions((prevPerms) => ({
                ...prevPerms,
                // eslint-disable-next-line security/detect-object-injection
                [permission]: roleString,
            }))

            return newSelectedRoles
        })
    }

    const handleConfirm = () => {
        intentionalCloseRef.current = true
        onConfirm(permissions)
        onOpenChange(false)
        setIsInitialized(false)
    }

    const handleCancel = () => {
        intentionalCloseRef.current = true
        onCancel()
        onOpenChange(false)
        setIsInitialized(false)
    }

    useEffect(() => {
        if (!open) {
            setIsInitialized(false)
            if (!intentionalCloseRef.current) {
                onCancel()
            }
            intentionalCloseRef.current = false
        }
    }, [open, onCancel])

    const getPermissionLabel = (permission: string) => {
        switch (permission) {
            case "read":
                return "Read"
            case "update":
                return "Update"
            case "delete":
                return "Delete"
            default:
                return permission
        }
    }

    const getPermissionColor = (permission: string) => {
        switch (permission) {
            case "read":
                return "bg-blue-100 text-blue-800 hover:bg-blue-100 hover:text-blue-800 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-900 dark:hover:text-blue-100"
            case "update":
                return "bg-green-100 text-green-800 hover:bg-green-100 hover:text-green-800 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-900 dark:hover:text-green-100"
            case "delete":
                return "bg-red-100 text-red-800 hover:bg-red-100 hover:text-red-800 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-900 dark:hover:text-red-100"
            default:
                return "bg-gray-100 text-gray-800 hover:bg-gray-100 hover:text-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-900 dark:hover:text-gray-100"
        }
    }

    const isAllSelected = (permission: "read" | "update" | "delete") => {
        // eslint-disable-next-line security/detect-object-injection
        return selectedRoles[permission].size === availableRoles[permission].length
    }

    const isAnySelected = (permission: "read" | "update" | "delete") => {
        // eslint-disable-next-line security/detect-object-injection
        return selectedRoles[permission].size > requiredRoles[permission].size
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Assign Permissions - {filename}</DialogTitle>
                    <DialogDescription className="hidden">
                        {isMultipleFileUpload
                            ? `Assign permissions for ${filename}. The selected permissions will be applied to all files.`
                            : "Assign permissions for this file."}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    <div className="grid gap-4">
                        {(["read", "update", "delete"] as const).map((permission) => (
                            <Card key={permission}>
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Badge className={getPermissionColor(permission)}>
                                                {getPermissionLabel(permission)}
                                            </Badge>
                                            {permission === "update" && <Badge variant="outline">Share</Badge>}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleSelectAll(permission)}
                                                disabled={isAllSelected(permission)}
                                            >
                                                Select All
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleClearAll(permission)}
                                                disabled={!isAnySelected(permission)}
                                            >
                                                Clear All
                                            </Button>
                                        </div>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            {/* eslint-disable-next-line security/detect-object-injection */}
                                            {availableRoles[permission].map((role) => {
                                                // eslint-disable-next-line security/detect-object-injection
                                                const isRequired = requiredRoles[permission].has(role)
                                                return (
                                                    <div key={role} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`${permission}-${role}`}
                                                            // eslint-disable-next-line security/detect-object-injection
                                                            checked={selectedRoles[permission].has(role)}
                                                            onCheckedChange={(checked) =>
                                                                handleRoleToggle(permission, role, checked as boolean)
                                                            }
                                                            disabled={isRequired}
                                                        />
                                                        <label
                                                            htmlFor={`${permission}-${role}`}
                                                            className={`text-sm font-medium leading-none ${
                                                                isRequired ? "opacity-70" : "cursor-pointer"
                                                            }`}
                                                        >
                                                            <Badge
                                                                variant={isRequired ? "default" : "outline"}
                                                                className={
                                                                    isRequired
                                                                        ? "bg-foreground/40 text-white hover:bg-foreground/40 hover:text-white cursor-not-allowed"
                                                                        : ""
                                                                }
                                                            >
                                                                {role}
                                                            </Badge>
                                                        </label>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                <DialogFooter>
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={
                                availableRoles.read.length === 0 &&
                                availableRoles.update.length === 0 &&
                                availableRoles.delete.length === 0
                            }
                        >
                            {filename.includes("files") ? "Upload Files" : "Apply Permissions"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
