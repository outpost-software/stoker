import {
    StringField as StringFieldType,
    NumberField as NumberFieldType,
    ArrayField as ArrayFieldType,
    RelationField as RelationFieldType,
    CollectionField,
    CollectionMeta,
    CollectionSchema,
    StokerCollection,
    StokerRecord,
    UserData,
    StokerRelation,
    StokerRelationObject,
    AccessOperations,
    StokerPermissions,
    CollectionPermissions,
    Convert,
    LocationFieldAdmin,
    CustomField,
    FormButton,
    FormFieldIcon,
    StorageItem,
    FormList,
    SystemField,
} from "@stoker-platform/types"
import {
    getCachedConfigValue,
    tryPromise,
    getFieldCustomization,
    isRelationField,
    runHooks,
    systemFields,
    tryFunction,
    getInputSchema,
    getField,
    restrictCreateAccess,
    restrictUpdateAccess,
    collectionAccess,
    validateStorageName,
} from "@stoker-platform/utils"
import {
    addRecord,
    deleteRecord,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getOne,
    updateRecord,
    deserializeTimestamps,
    getGlobalConfigModule,
    getSchema,
    getSome,
    keepTimezone,
    getTimezone,
    removeTimezone,
    serializeTimestamps,
    getFiles,
    getTenant,
} from "@stoker-platform/web-client"
import { createElement, forwardRef, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { createPortal } from "react-dom"
import isEqual from "lodash/isEqual.js"
import cloneDeep from "lodash/cloneDeep.js"
import { removeEmptyStrings } from "./utils/removeEmptyStrings"
import { useGlobalLoading } from "./providers/LoadingProvider"
import {
    deleteField,
    doc,
    collection as dbCollection,
    getFirestore,
    Timestamp,
    QueryConstraint,
    where,
    onSnapshot,
    Unsubscribe,
    WhereFilterOp,
} from "firebase/firestore"
import { runViewTransition } from "./utils/runViewTransition"
import { isOfflineDisabled as isOfflineDisabledSync } from "./utils/isOfflineDisabled"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "./components/ui/alert-dialog"
import { Button } from "./components/ui/button"
import { useToast } from "./hooks/use-toast"
import { isServerCreate, isServerDelete, isServerUpdate } from "./utils/isServerWrite"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { useOptimistic } from "./providers/OptimisticProvider"
import { serverReadOnly } from "./utils/serverReadOnly"
import { Helmet } from "react-helmet"
import { ControllerRenderProps, FieldValues, useForm, UseFormReturn } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Form, FormControl, FormLabel, FormField, FormItem, FormMessage, FormDescription } from "./components/ui/form"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu"
import { Input } from "./components/ui/input"
import { Checkbox } from "./components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { Calendar } from "./components/ui/calendar"
import {
    Check,
    ChevronDownIcon,
    ChevronsUpDown,
    XCircle,
    X,
    ChevronDown,
    FileIcon,
    Trash2,
    ChevronLeftIcon,
    ChevronRightIcon,
    Folder,
} from "lucide-react"
import { LocationPicker } from "./LocationPicker"
import { Textarea } from "./components/ui/textarea"
import { DateTime } from "luxon"
import { useGoToRecord } from "./utils/goToRecord"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover"
import { getFilterDisjunctions } from "./utils/getFilterDisjunctions"
import { performFullTextSearch } from "./utils/performFullTextSearch"
import { localFullTextSearch } from "./utils/localFullTextSearch"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./components/ui/command"
import { cn } from "./lib/utils"
import { getRelationFields } from "./utils/getRelationFields"
import { Label } from "./components/ui/label"
import { PermissionPicker } from "./PermissionPicker"
import { trapFocus } from "./utils/trapFocus"
import { Switch } from "./components/ui/switch"
import { Slider } from "./components/ui/slider"
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group"
import { getFormattedFieldValue } from "./utils/getFormattedFieldValue"
import { getSafeUrl } from "./utils/isSafeUrl"
import { useConnection } from "./providers/ConnectionProvider"
import { getAuth } from "firebase/auth"
import Quill, { Delta } from "quill"
import "quill/dist/quill.core.css"
import "quill/dist/quill.snow.css"
import { Breadcrumbs } from "./Breadcrumbs"
import { FilePermissionsDialog, FilePermissions } from "./FilePermissions"
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./components/ui/dialog"
import { FiltersProvider } from "./providers/FiltersProvider"
import Collection from "./Collection"
import { Separator } from "./components/ui/separator"
import { SearchResult } from "minisearch"
import { sortList } from "./utils/sortList"

interface FormLabelWithIconProps {
    collection: CollectionSchema
    label?: string
    field: CollectionField
    operation: "create" | "update" | "update-many"
    icon?: FormFieldIcon
    className?: string
    form: UseFormReturn
}

const FormLabelWithIcon = ({ collection, label, field, operation, icon, className, form }: FormLabelWithIconProps) => {
    const customization = getCollectionConfigModule(collection.labels.collection)
    const fieldCustomization = getFieldCustomization(field, customization)

    const displayLabel = label || field.name

    let isRequired = field.required && operation !== "update-many"
    if (!isRequired && fieldCustomization.admin?.overrideFormRequiredValidation && operation !== "update-many") {
        isRequired = !!tryFunction(fieldCustomization.admin.overrideFormRequiredValidation, [
            operation,
            form.getValues(),
        ])
    }

    if (!icon) {
        return (
            <FormLabel className={cn("text-primary", className)}>
                {displayLabel}
                {isRequired ? "*" : ""}
            </FormLabel>
        )
    }

    const IconComponent = icon.component as React.FC<{ className?: string }>
    return (
        <FormLabel className={cn("text-primary flex items-center gap-2", className)}>
            <IconComponent className={icon.className} />
            {displayLabel}
            {isRequired ? "*" : ""}
        </FormLabel>
    )
}

const getTabId = () => {
    let tabId = sessionStorage.getItem("stoker-tab-id")
    if (!tabId) {
        tabId = `tab-${crypto.randomUUID()}`
        sessionStorage.setItem("stoker-tab-id", tabId)
    }
    return tabId
}

interface FormProps {
    collection: CollectionSchema
    operation: "create" | "update" | "update-many"
    path: string[]
    isLoading?: React.RefObject<boolean>
    record?: StokerRecord
    draft?: boolean
    onSuccess?: () => void
    onSaveRecord?: () => void
    rowSelection?: StokerRecord[]
    fromRelationList?: string
}

interface FieldProps {
    operation: "create" | "update" | "update-many"
    form: UseFormReturn
    collection: CollectionSchema
    field: CollectionField
    setIsFormReady: React.Dispatch<React.SetStateAction<number>>
    formResetKey?: number
    record?: StokerRecord
    path?: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value?: any
    label?: string
    description?: string
    readOnly?: boolean
    isUpdateDisabled?: boolean
    isDisabled?: boolean
    icon?: FormFieldIcon
    isUploading?: Record<string, boolean>
    setIsUploading?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
    enqueueImageForCreate?: (fieldName: string, file: File) => void
    uploadImageForUpdate?: (fieldName: string, file: File) => Promise<void>
}

interface CustomFieldProps {
    operation: "create" | "update" | "update-many"
    form: UseFormReturn<FieldValues>
    collection: CollectionSchema
    record?: StokerRecord
    isDisabled?: boolean
    isUpdateDisabled?: boolean
    formResetKey?: number
}

const RecordFormField = (props: FieldProps) => {
    const {
        form,
        collection,
        field,
        operation,
        record,
        isDisabled,
        isUpdateDisabled,
        setIsFormReady,
        formResetKey,
        enqueueImageForCreate,
        uploadImageForUpdate,
    } = props
    const schema = getSchema()
    const [connectionStatus] = useConnection()
    const customizationFile = getCollectionConfigModule(collection.labels.collection)
    const customization = getFieldCustomization(field, customizationFile)
    const admin = customization.admin
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")

    const [label, setLabel] = useState("")
    const [condition, setCondition] = useState(false)
    const [readOnly, setReadOnly] = useState(false)
    const [description, setDescription] = useState("")
    const [isTextarea, setIsTextarea] = useState(false)
    const [isSwitch, setIsSwitch] = useState(false)
    const [isTime, setIsTime] = useState(false)
    const [isSlider, setIsSlider] = useState(false)
    const [isRichText, setIsRichText] = useState(false)
    const [isLocation, setIsLocation] = useState<LocationFieldAdmin | undefined>(undefined)
    const [isImage, setIsImage] = useState(false)
    const [isRadio, setIsRadio] = useState(false)
    const [icon, setIcon] = useState<FormFieldIcon | undefined>(undefined)

    useEffect(() => {
        const initialize = async () => {
            const condition = tryFunction(admin?.condition?.form, [operation, record])
            setCondition(!!condition)

            const [
                readOnly,
                label,
                description,
                descriptionCondition,
                textarea,
                isSwitch,
                isTime,
                isSlider,
                isRichText,
                image,
                isLocation,
                isRadio,
                icon,
            ] = await Promise.all([
                tryPromise(admin?.readOnly, [operation, record]),
                tryFunction(admin?.label),
                tryFunction(admin?.description?.message, [record]),
                tryPromise(admin?.description?.condition, [record]),
                tryPromise(admin?.textarea),
                tryPromise(admin?.switch),
                tryPromise(admin?.time),
                tryPromise(admin?.slider),
                tryPromise(admin?.richText),
                tryPromise(admin?.image),
                tryPromise(admin?.location),
                tryPromise(admin?.radio),
                tryPromise(admin?.icon),
            ])

            setReadOnly(!!readOnly)
            setLabel(label || field.name)
            if (!(admin?.description?.condition && !descriptionCondition)) {
                setDescription(description)
            }
            setIsTextarea(!!textarea)
            setIsSwitch(!!isSwitch)
            setIsTime(!!isTime)
            setIsSlider(!!isSlider)
            setIsRichText(!!isRichText)
            setIsImage(!!image)
            setIsLocation(isLocation)
            setIsRadio(!!isRadio)
            setIcon(icon)
            // Prevent button and rich text editor from flickering
            setTimeout(() => {
                setIsFormReady((prevState) => prevState + 1)
            }, 100)
        }
        initialize()
    }, [])

    useEffect(() => {
        const condition = tryFunction(admin?.condition?.form, [operation, form.getValues()])
        if (condition === false) {
            setCondition(false)
            return
        }
        setCondition(true)
    }, [form.watch()])

    const hasUpdateAccess = useMemo(() => {
        return collectionAccess(
            "Update",
            permissions?.collections?.[collection.labels.collection] as CollectionPermissions,
        )
    }, [collection, permissions])

    if (field.type === "Map" && !isRichText) return null

    if (!label || !condition || (collection.auth && field.name === "User_ID")) {
        return null
    }

    if (operation === "create" && !restrictCreateAccess(field, permissions)) {
        return null
    }

    if (operation === "create" && customization.custom?.initialValue !== undefined) {
        return null
    }

    if (operation === "update-many") {
        if ("unique" in field && field.unique) return null
        if (customization?.admin && "readOnly" in customization.admin) return null
        if ("restrictUpdate" in field) return null

        if (collection.auth && field.name === "Role") return null
        if (connectionStatus === "offline" && collection.auth) return null

        if (!hasUpdateAccess) return null
        if (isUpdateDisabled) return null
    }

    const isReadOnly =
        (readOnly && !isRelationField(field)) ||
        (operation === "update" &&
            (!restrictUpdateAccess(field, permissions) ||
                (collection.auth && field.name === "Role" && record?.User_ID) ||
                !hasUpdateAccess ||
                isUpdateDisabled))

    if (isReadOnly && !isRichText) {
        return <ComputedField {...props} label={label} description={description} icon={icon} />
    }

    switch (field.type) {
        case "String":
            if (isImage) {
                return (
                    <ImageField
                        {...props}
                        label={label}
                        description={description}
                        isDisabled={isDisabled}
                        icon={icon}
                        enqueueImageForCreate={enqueueImageForCreate}
                        uploadImageForUpdate={uploadImageForUpdate}
                        record={record}
                    />
                )
            }
            return (
                <StringField
                    {...props}
                    label={label}
                    description={description}
                    isTextarea={isTextarea}
                    isDisabled={isDisabled}
                    isRadio={isRadio}
                    isTime={isTime}
                    icon={icon}
                />
            )
        case "Boolean":
            return (
                <BooleanField
                    {...props}
                    label={label}
                    description={description}
                    isSwitch={isSwitch}
                    isDisabled={isDisabled}
                    icon={icon}
                />
            )
        case "Number":
            return (
                <NumberField
                    {...props}
                    label={label}
                    description={description}
                    isDisabled={isDisabled}
                    isSlider={isSlider}
                    icon={icon}
                />
            )
        case "Timestamp":
            return (
                <TimestampField
                    {...props}
                    label={label}
                    description={description}
                    isDisabled={isDisabled}
                    isTime={isTime}
                    icon={icon}
                />
            )
        case "Array":
            return (
                <ArrayField
                    {...props}
                    label={label}
                    description={description}
                    isDisabled={isDisabled}
                    isLocation={isLocation}
                    icon={icon}
                />
            )
        case "Map":
            return (
                <MapField
                    {...props}
                    label={label}
                    description={description}
                    isDisabled={isDisabled}
                    isRichText={isRichText}
                    readOnly={isReadOnly}
                    icon={icon}
                />
            )
        case "Computed":
            return <ComputedField {...props} label={label} description={description} icon={icon} />
        default:
            if (isRelationField(field) && schema.collections[field.collection]) {
                return (
                    <RelationField
                        {...props}
                        label={label}
                        description={description}
                        isDisabled={isDisabled}
                        formResetKey={formResetKey}
                        readOnly={readOnly}
                        icon={icon}
                    />
                )
            }
            return null
    }
}

function StringField({
    collection,
    record,
    operation,
    label,
    description,
    field,
    form,
    isTextarea,
    isDisabled,
    isRadio,
    isTime,
    icon,
}: FieldProps & { isTextarea?: boolean; isRadio?: boolean; isTime?: boolean }) {
    const customization = getCollectionConfigModule(collection.labels.collection)
    const fieldCustomization = getFieldCustomization(field, customization)
    if ((field as StringFieldType).values) {
        if (isRadio) {
            return (
                <FormField
                    control={form.control}
                    name={field.name}
                    defaultValue={
                        operation !== "update-many" &&
                        field.required &&
                        (form.getValues(field.name) === undefined ||
                            form.getValues(field.name) === null ||
                            form.getValues(field.name) === "")
                            ? (field as StringFieldType).values?.[0]
                            : undefined
                    }
                    render={({ field: formField }) => (
                        <FormItem>
                            <FormLabelWithIcon
                                collection={collection}
                                label={label}
                                field={field}
                                operation={operation}
                                icon={icon}
                                form={form}
                            />
                            <FormControl>
                                <RadioGroup
                                    onValueChange={formField.onChange}
                                    value={formField.value}
                                    disabled={isDisabled}
                                    className="pt-2"
                                >
                                    {(field as StringFieldType).values
                                        ?.filter(
                                            (option) =>
                                                !fieldCustomization.admin?.filterValues ||
                                                fieldCustomization.admin?.filterValues?.(option, collection, record),
                                        )
                                        .map((option) => (
                                            <div key={option} className="flex items-center space-x-2">
                                                <RadioGroupItem value={option} id={`${field.name}-${option}`} />
                                                <Label
                                                    htmlFor={`${field.name}-${option}`}
                                                    className="font-normal cursor-pointer"
                                                >
                                                    {option}
                                                </Label>
                                            </div>
                                        ))}
                                </RadioGroup>
                            </FormControl>
                            {description && <FormDescription>{description}</FormDescription>}
                            <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                        </FormItem>
                    )}
                />
            )
        }
        return (
            <FormField
                control={form.control}
                name={field.name}
                defaultValue={
                    operation !== "update-many" &&
                    field.required &&
                    (form.getValues(field.name) === undefined ||
                        form.getValues(field.name) === null ||
                        form.getValues(field.name) === "")
                        ? (field as StringFieldType).values?.[0]
                        : undefined
                }
                render={({ field: formField }) => (
                    <FormItem>
                        <FormLabelWithIcon
                            collection={collection}
                            label={label}
                            field={field}
                            operation={operation}
                            icon={icon}
                            form={form}
                        />
                        <FormControl>
                            <Select onValueChange={formField.onChange} value={formField.value} disabled={isDisabled}>
                                <SelectTrigger>
                                    <SelectValue placeholder={`Select ${label?.toLowerCase()}...`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(field as StringFieldType).values
                                        ?.filter(
                                            (option) =>
                                                !fieldCustomization.admin?.filterValues ||
                                                fieldCustomization.admin?.filterValues?.(option, collection, record),
                                        )
                                        .map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {option}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </FormControl>
                        {description && <FormDescription>{description}</FormDescription>}
                        <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                    </FormItem>
                )}
            />
        )
    }
    return (
        <FormField
            control={form.control}
            name={field.name}
            render={({ field: formField }) => (
                <FormItem>
                    <FormLabelWithIcon
                        collection={collection}
                        label={label}
                        field={field}
                        operation={operation}
                        icon={icon}
                        form={form}
                    />
                    <FormControl>
                        {isTextarea ? (
                            <Textarea
                                {...formField}
                                ref={(textarea) => {
                                    if (textarea) {
                                        textarea.style.height = "0px"
                                        textarea.style.height = textarea.scrollHeight + "px"
                                    }
                                }}
                                disabled={isDisabled}
                            />
                        ) : isTime ? (
                            <Input
                                {...formField}
                                type="time"
                                step="60"
                                disabled={isDisabled}
                                value={formField.value || ""}
                                className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                            />
                        ) : (
                            <Input {...formField} disabled={isDisabled} />
                        )}
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                </FormItem>
            )}
        />
    )
}

function ImageField({
    collection,
    record,
    operation,
    label,
    description,
    field,
    form,
    isDisabled,
    icon,
    isUploading,
    setIsUploading,
    enqueueImageForCreate,
    uploadImageForUpdate,
}: FieldProps) {
    const [showFileDialog, setShowFileDialog] = useState(false)
    const [fileItems, setFileItems] = useState<StorageItem[]>([])
    const [currentPath, setCurrentPath] = useState("")
    const [loadingFiles, setLoadingFiles] = useState(false)
    const objectUrlRef = useRef<string | null>(null)

    const revokeObjectUrl = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current)
            objectUrlRef.current = null
        }
    }, [])

    useEffect(() => {
        return () => {
            revokeObjectUrl()
        }
    }, [])

    const loadFiles = useCallback(
        async (path: string) => {
            if (!record) return
            setLoadingFiles(true)
            try {
                const items = await getFiles(path, record)
                const filtered = items.filter((item) => item.isFolder || /\.(png|jpe?g|gif|webp|svg)$/i.test(item.name))
                setFileItems(filtered)
                setCurrentPath(path)
            } finally {
                setLoadingFiles(false)
            }
        },
        [record],
    )

    const handleOpenFileDialog = useCallback(() => {
        if (!record) return
        setShowFileDialog(true)
        loadFiles("")
    }, [record, loadFiles])

    const goUp = useCallback(() => {
        if (!currentPath) return
        const parts = currentPath.split("/").filter(Boolean)
        parts.pop()
        loadFiles(parts.join("/"))
    }, [currentPath, loadFiles])

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files || files.length === 0) return
        const file = files[0]
        if (operation === "create") {
            if (!enqueueImageForCreate) return
            enqueueImageForCreate(field.name, file)
            revokeObjectUrl()
            setTimeout(() => {
                const objectUrl = URL.createObjectURL(file)
                objectUrlRef.current = objectUrl
                form.setValue(field.name, objectUrl, { shouldDirty: true })
            }, 250)
        } else {
            if (!uploadImageForUpdate || !setIsUploading) return
            setIsUploading((prev) => ({ ...prev, [field.name]: true }))
            await uploadImageForUpdate(field.name, file)
            setIsUploading((prev) => ({ ...prev, [field.name]: false }))
        }
        event.target.value = ""
    }

    const handleSelectExisting = useCallback(
        async (item: StorageItem) => {
            const storage = getStorage()
            revokeObjectUrl()
            const url = await getDownloadURL(ref(storage, item.fullPath))
            form.setValue(field.name, url, { shouldDirty: true })
            setShowFileDialog(false)
        },
        [form, field],
    )

    const [imageLoaded, setImageLoaded] = useState(false)

    return (
        <FormField
            control={form.control}
            name={field.name}
            render={({ field: formField }) => (
                <FormItem>
                    <FormLabelWithIcon
                        collection={collection}
                        label={label}
                        field={field}
                        operation={operation}
                        icon={icon}
                        form={form}
                    />
                    <FormControl>
                        <div className="flex flex-col gap-2">
                            {formField.value && typeof formField.value === "string" && (
                                <div
                                    className={cn(
                                        isDisabled || (formField.value && !imageLoaded) ? "h-[300px]" : "max-h-[300px]",
                                        "max-w-full",
                                    )}
                                >
                                    <img
                                        src={getSafeUrl(formField.value)}
                                        alt={label || field.name}
                                        className="max-h-[300px] max-w-full object-contain rounded ease-in-out duration-300"
                                        onLoad={() => setImageLoaded(true)}
                                        onError={() => setImageLoaded(false)}
                                    />
                                </div>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                disabled={isDisabled || isUploading?.[field.name]}
                                className="block text-[0px] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                            />
                            {operation === "update" && record && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleOpenFileDialog}
                                    disabled={isDisabled || isUploading?.[field.name]}
                                    className="w-fit"
                                >
                                    Choose existing
                                </Button>
                            )}
                            {isUploading?.[field.name] && <LoadingSpinner size={7} />}
                        </div>
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                    <Dialog open={showFileDialog} onOpenChange={setShowFileDialog}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Select existing image</DialogTitle>
                                <DialogDescription className="hidden">
                                    Choose an image already uploaded for this record.
                                </DialogDescription>
                            </DialogHeader>
                            {currentPath && (
                                <div className="flex items-center gap-2 mb-2">
                                    <Button type="button" variant="outline" onClick={goUp} disabled={loadingFiles}>
                                        <ChevronLeftIcon className="w-4 h-4" />
                                    </Button>
                                    <div className="text-sm text-muted-foreground truncate">{currentPath || "/"}</div>
                                </div>
                            )}
                            <div className="max-h-[300px] overflow-auto">
                                {loadingFiles ? (
                                    <div className="flex justify-center py-6">
                                        <LoadingSpinner size={7} />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2">
                                        {fileItems.map((item) => (
                                            <div
                                                key={item.fullPath}
                                                className="flex items-center justify-between gap-2 border rounded px-3 py-2"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {item.isFolder ? (
                                                        <Folder className="w-4 h-4" />
                                                    ) : (
                                                        <FileIcon className="w-4 h-4" />
                                                    )}
                                                    <span className="text-sm">{item.name}</span>
                                                </div>
                                                {item.isFolder ? (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() =>
                                                            loadFiles(
                                                                currentPath ? `${currentPath}/${item.name}` : item.name,
                                                            )
                                                        }
                                                        disabled={loadingFiles}
                                                    >
                                                        Open
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() => handleSelectExisting(item)}
                                                        disabled={loadingFiles}
                                                    >
                                                        Select
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        {fileItems.length === 0 && (
                                            <div className="text-sm text-muted-foreground px-1">No files found</div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setShowFileDialog(false)}>
                                    Close
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </FormItem>
            )}
        />
    )
}

function NumberField({
    collection,
    record,
    operation,
    label,
    description,
    field,
    form,
    isDisabled,
    isSlider,
    icon,
}: FieldProps & { isSlider?: boolean }) {
    if ("autoIncrement" in field && field.autoIncrement) {
        return null
    }
    const customization = getCollectionConfigModule(collection.labels.collection)
    const fieldCustomization = getFieldCustomization(field, customization)
    if ((field as NumberFieldType).values) {
        return (
            <FormField
                control={form.control}
                name={field.name}
                defaultValue={
                    operation !== "update-many" &&
                    field.required &&
                    (form.getValues(field.name) === undefined ||
                        form.getValues(field.name) === null ||
                        form.getValues(field.name) === "")
                        ? (field as NumberFieldType).values?.[0]
                        : undefined
                }
                render={({ field: formField }) => (
                    <FormItem>
                        <FormLabelWithIcon
                            collection={collection}
                            label={label}
                            field={field}
                            operation={operation}
                            icon={icon}
                            form={form}
                        />
                        <FormControl>
                            <Select
                                onValueChange={(value) => formField.onChange(Number(value))}
                                value={formField.value?.toString()}
                                disabled={isDisabled}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={`Select ${label?.toLowerCase()}...`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(field as NumberFieldType).values
                                        ?.filter(
                                            (option) =>
                                                !fieldCustomization.admin?.filterValues ||
                                                fieldCustomization.admin?.filterValues?.(option, collection, record),
                                        )
                                        .map((option) => (
                                            <SelectItem key={option} value={option.toString()}>
                                                {option}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </FormControl>
                        {description && <FormDescription>{description}</FormDescription>}
                        <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                    </FormItem>
                )}
            />
        )
    }
    if (isSlider) {
        const numberField = field as NumberFieldType
        const min = numberField.min ?? 0
        const max = numberField.max ?? 100
        const step = numberField.decimal ? Math.pow(10, -numberField.decimal) : 1

        return (
            <FormField
                control={form.control}
                name={field.name}
                render={({ field: formField }) => (
                    <FormItem>
                        <FormLabelWithIcon
                            collection={collection}
                            label={label}
                            field={field}
                            operation={operation}
                            icon={icon}
                            form={form}
                        />
                        <FormControl>
                            <div className="space-y-3">
                                <Slider
                                    min={min}
                                    max={max}
                                    step={step}
                                    value={[formField.value ?? min]}
                                    onValueChange={(value) => formField.onChange(value[0])}
                                    disabled={isDisabled}
                                    className="w-full bg-blue-500"
                                />
                                <div className="flex justify-between text-sm text-muted-foreground">
                                    <span>{min}</span>
                                    <span className="font-medium">{formField.value ?? min}</span>
                                    <span>{max}</span>
                                </div>
                            </div>
                        </FormControl>
                        {description && <FormDescription>{description}</FormDescription>}
                        <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                    </FormItem>
                )}
            />
        )
    }

    const numberField = field as NumberFieldType
    const step = numberField.decimal ? Math.pow(10, -numberField.decimal) : undefined
    const min = numberField.min
    const max = numberField.max

    return (
        <FormField
            control={form.control}
            name={field.name}
            render={({ field: formField }) => (
                <FormItem>
                    <FormLabelWithIcon
                        collection={collection}
                        label={label}
                        field={field}
                        operation={operation}
                        icon={icon}
                        form={form}
                    />
                    <FormControl>
                        <Input
                            type="number"
                            value={formField.value}
                            onChange={(e) => {
                                const value = e.target.value
                                formField.onChange(value === "" ? null : Number(value))
                            }}
                            step={step}
                            min={min}
                            max={max}
                            disabled={isDisabled}
                        />
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                </FormItem>
            )}
        />
    )
}

function BooleanField({
    collection,
    operation,
    label,
    description,
    field,
    form,
    isSwitch,
    isDisabled,
    icon,
}: FieldProps & { isSwitch?: boolean }) {
    return (
        <FormField
            control={form.control}
            name={field.name}
            defaultValue={operation === "update-many" ? undefined : false}
            render={({ field: formField }) => {
                return (
                    <FormItem className="flex flex-row items-center gap-3">
                        <FormLabelWithIcon
                            collection={collection}
                            label={label}
                            field={field}
                            operation={operation}
                            icon={icon}
                            className="text-sm font-normal relative bottom-1"
                            form={form}
                        />
                        <FormControl>
                            {isSwitch ? (
                                <Switch
                                    checked={formField.value}
                                    onCheckedChange={(checked) => {
                                        formField.onChange(checked)
                                    }}
                                    disabled={isDisabled}
                                    className="data-[state=checked]:bg-blue-500 relative bottom-2"
                                />
                            ) : (
                                <Checkbox
                                    checked={formField.value}
                                    onCheckedChange={(checked) => {
                                        return checked ? formField.onChange(true) : formField.onChange(false)
                                    }}
                                    disabled={isDisabled}
                                    className="relative bottom-2"
                                />
                            )}
                        </FormControl>
                        {description && <FormDescription>{description}</FormDescription>}
                        <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                    </FormItem>
                )
            }}
        />
    )
}

function TimestampField({
    collection,
    operation,
    label,
    description,
    field,
    form,
    isDisabled,
    isTime,
    icon,
}: FieldProps & { isTime?: boolean }) {
    const [open, setOpen] = useState(false)
    const globalConfig = getGlobalConfigModule()
    const timezone = getTimezone()
    const dateFormat = tryFunction(globalConfig.admin?.dateFormat) || "D"

    const [month, setMonth] = useState<Date | undefined>(undefined)
    const timestamp: Timestamp | null = form.watch(field.name)
    useEffect(() => {
        if (timestamp) {
            const date = DateTime.fromJSDate(timestamp.toDate()).setZone(timezone)
            setMonth(keepTimezone(date.toJSDate(), timezone))
        }
    }, [timestamp, timezone])

    return (
        <FormField
            control={form.control}
            name={field.name}
            render={({ field: formField }) => {
                const currentValue = formField.value
                    ? DateTime.fromJSDate(formField.value.toDate()).setZone(timezone)
                    : undefined
                if (isTime) {
                    // Use HH:mm for broad browser compatibility (iOS Safari returns HH:mm)
                    const timeString = currentValue?.toFormat("HH:mm") || "00:00"

                    return (
                        <FormItem>
                            <FormLabelWithIcon
                                collection={collection}
                                label={label}
                                field={field}
                                operation={operation}
                                icon={icon}
                                form={form}
                            />
                            <FormControl>
                                <div className="flex gap-4 flex-col sm:flex-row">
                                    <div className="flex flex-col gap-3">
                                        <div className="flex gap-2">
                                            <Popover open={open} onOpenChange={setOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        id={`${field.name}-date-picker`}
                                                        className="w-full sm:w-32 justify-between font-normal"
                                                        disabled={isDisabled}
                                                    >
                                                        {formField.value
                                                            ? currentValue?.toFormat(dateFormat) || ""
                                                            : "Select date"}
                                                        <ChevronDownIcon />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={
                                                            currentValue
                                                                ? keepTimezone(currentValue.toJSDate(), timezone)
                                                                : undefined
                                                        }
                                                        month={month}
                                                        defaultMonth={
                                                            currentValue
                                                                ? keepTimezone(currentValue.toJSDate(), timezone)
                                                                : undefined
                                                        }
                                                        weekStartsOn={1}
                                                        captionLayout="dropdown"
                                                        onMonthChange={setMonth}
                                                        onSelect={(date) => {
                                                            if (!date) return
                                                            const parts = timeString.split(":")
                                                            const hours = parseInt(parts[0] || "0")
                                                            const minutes = parseInt(parts[1] || "0")
                                                            const secondsFromValue =
                                                                parts[2] !== undefined
                                                                    ? parseInt(parts[2])
                                                                    : currentValue
                                                                      ? currentValue.second
                                                                      : 0
                                                            const newDate = DateTime.fromJSDate(date)
                                                                .setZone(timezone)
                                                                .set({
                                                                    hour: hours,
                                                                    minute: minutes,
                                                                    second: secondsFromValue,
                                                                })
                                                            const utcDate = newDate.toJSDate()
                                                            formField.onChange(Timestamp.fromDate(utcDate))
                                                        }}
                                                        disabled={isDisabled}
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex gap-4 flex-col sm:flex-row">
                                            <Input
                                                type="time"
                                                id={`${field.name}-time-picker`}
                                                step="60"
                                                value={timeString}
                                                onChange={(e) => {
                                                    const newTime = e.target.value
                                                    if (!newTime) return
                                                    const parts = newTime.split(":")
                                                    if (parts.length < 2) return
                                                    const hours = parseInt(parts[0] || "0")
                                                    const minutes = parseInt(parts[1] || "0")
                                                    const seconds =
                                                        parts[2] !== undefined
                                                            ? parseInt(parts[2])
                                                            : currentValue
                                                              ? currentValue.second
                                                              : 0
                                                    const baseDate = currentValue || DateTime.now().setZone(timezone)
                                                    const newDate = baseDate.set({
                                                        hour: hours,
                                                        minute: minutes,
                                                        second: seconds,
                                                    })
                                                    formField.onChange(Timestamp.fromDate(newDate.toJSDate()))
                                                }}
                                                className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                                disabled={isDisabled}
                                            />
                                            {formField.value && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => formField.onChange(null)}
                                                    disabled={isDisabled}
                                                    className="px-2"
                                                >
                                                    Clear
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </FormControl>
                            {description && <FormDescription>{description}</FormDescription>}
                            <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                        </FormItem>
                    )
                } else {
                    return (
                        <FormItem>
                            <FormLabelWithIcon
                                collection={collection}
                                label={label}
                                field={field}
                                operation={operation}
                                icon={icon}
                                form={form}
                            />
                            <FormControl>
                                <div className="flex flex-col gap-2">
                                    <Calendar
                                        mode="single"
                                        selected={
                                            currentValue ? keepTimezone(currentValue.toJSDate(), timezone) : undefined
                                        }
                                        month={month}
                                        defaultMonth={
                                            currentValue ? keepTimezone(currentValue.toJSDate(), timezone) : undefined
                                        }
                                        onMonthChange={setMonth}
                                        onSelect={(date) => {
                                            if (date) {
                                                const newDate = removeTimezone(date, timezone)
                                                formField.onChange(Timestamp.fromDate(newDate))
                                            }
                                        }}
                                        weekStartsOn={1}
                                        className="rounded-md border w-[250px]"
                                        disabled={isDisabled}
                                    />
                                    {formField.value && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => formField.onChange(null)}
                                            disabled={isDisabled}
                                            className="w-fit"
                                        >
                                            Clear
                                        </Button>
                                    )}
                                </div>
                            </FormControl>
                            {description && <FormDescription>{description}</FormDescription>}
                            <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                        </FormItem>
                    )
                }
            }}
        />
    )
}

function ArrayField({
    collection,
    operation,
    label,
    description,
    field,
    form,
    isDisabled,
    isLocation,
    icon,
}: FieldProps & { isLocation?: LocationFieldAdmin }) {
    const [selectedValue, setSelectedValue] = useState<string | undefined>(undefined)

    if (isLocation) {
        return (
            <FormField
                control={form.control}
                name={field.name}
                render={({ field: formField }) => (
                    <FormItem>
                        <FormLabelWithIcon
                            collection={collection}
                            label={label}
                            field={field}
                            operation={operation}
                            icon={icon}
                            form={form}
                        />
                        <FormControl>
                            <LocationPicker
                                value={formField.value as [number, number] | null}
                                onChange={(value) => formField.onChange(value)}
                                disabled={isDisabled}
                                label={label}
                                defaultCenter={isLocation.center}
                                defaultZoom={isLocation.zoom}
                            />
                        </FormControl>
                        {description && <FormDescription>{description}</FormDescription>}
                        <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                    </FormItem>
                )}
            />
        )
    }
    return (
        <FormField
            control={form.control}
            name={field.name}
            render={({ field: formField }) => (
                <FormItem>
                    <FormLabelWithIcon
                        collection={collection}
                        label={label}
                        field={field}
                        operation={operation}
                        icon={icon}
                        form={form}
                    />
                    <FormControl>
                        <div className="flex flex-col">
                            <div className="flex gap-2">
                                <Select onValueChange={(value) => setSelectedValue(value)} disabled={isDisabled}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={`Select ${label?.toLowerCase()}...`} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(field as ArrayFieldType).values?.map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {option}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    onClick={(e) => {
                                        e.preventDefault()
                                        if (selectedValue && !formField.value?.includes(selectedValue)) {
                                            const newValues = [...(formField.value || []), selectedValue]
                                            formField.onChange(newValues)
                                        }
                                    }}
                                    disabled={isDisabled}
                                >
                                    Add
                                </Button>
                            </div>
                            <div className="mt-2">
                                {formField.value?.map((value: string, index: number) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <span className="text-sm">{value}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="p-1"
                                            onClick={() => {
                                                const newValues = [...formField.value]
                                                newValues.splice(index, 1)
                                                formField.onChange(newValues)
                                            }}
                                            disabled={isDisabled}
                                        >
                                            <XCircle className="w-5 h-5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                </FormItem>
            )}
        />
    )
}

const RichTextEditor = forwardRef<
    Quill,
    { readOnly?: boolean; formField: ControllerRenderProps<FieldValues, string>; isDisabled?: boolean }
>(({ readOnly, formField, isDisabled }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (ref && typeof ref === "object" && ref.current) {
            const quill = ref.current
            const currentContents = quill.getContents()
            const newContents = formField.value

            if (JSON.stringify(currentContents) !== JSON.stringify(newContents)) {
                quill.setContents(newContents || [])
            }
        }
    }, [ref, formField.value])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const editorContainer = container.appendChild(container.ownerDocument.createElement("div"))
        const quill = new Quill(editorContainer, {
            theme: "snow",
        })

        if (ref && typeof ref === "object") {
            ref.current = quill
        }

        if (formField.value) {
            quill.setContents(formField.value)
        }

        quill.on(Quill.events.TEXT_CHANGE, () => {
            formField.onChange(quill.getContents())
        })

        return () => {
            if (ref && typeof ref === "object") {
                ref.current = null
            }
            container.innerHTML = ""
        }
    }, [ref])

    useEffect(() => {
        if (ref && typeof ref === "object" && ref.current) {
            ref.current.enable(!readOnly && !isDisabled)
            const container = containerRef.current
            const toolbar = containerRef.current?.querySelector(".ql-toolbar")
            const editor = containerRef.current?.querySelector(".ql-editor")
            const quillContainer = containerRef.current?.querySelector(".ql-container.ql-snow")
            if (toolbar && container && editor && (readOnly || isDisabled)) {
                toolbar.classList.add("hidden")
                editor.classList.add("border")
                editor.classList.add("rounded-lg")
                quillContainer?.classList.add("disabled")
            } else if (toolbar && container && editor && !readOnly && !isDisabled) {
                toolbar.classList.remove("hidden")
                editor.classList.remove("border")
                editor.classList.remove("rounded-lg")
                quillContainer?.classList.remove("disabled")
            }
        }
    }, [ref, readOnly, isDisabled])

    return <div ref={containerRef}></div>
})
RichTextEditor.displayName = "RichTextEditor"

function MapField({
    collection,
    operation,
    label,
    form,
    description,
    field,
    readOnly,
    isRichText,
    icon,
    isDisabled,
}: FieldProps & { isRichText?: boolean }) {
    const quillRef = useRef<Quill | null>(null)
    if (isRichText) {
        return (
            <FormField
                control={form.control}
                name={field.name}
                render={({ field: formField }) => (
                    <FormItem>
                        <FormLabelWithIcon
                            collection={collection}
                            label={label}
                            field={field}
                            operation={operation}
                            icon={icon}
                            form={form}
                        />
                        <FormControl>
                            <RichTextEditor
                                ref={quillRef}
                                readOnly={readOnly}
                                formField={formField}
                                isDisabled={isDisabled}
                            />
                        </FormControl>
                        {description && <FormDescription>{description}</FormDescription>}
                        <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                    </FormItem>
                )}
            />
        )
    }
    return null
}

function RelationField({
    label,
    collection,
    description,
    field,
    isDisabled,
    form,
    record,
    value,
    formResetKey,
    readOnly,
    operation,
    icon,
}: FieldProps) {
    const schema = getSchema(true)
    const relationCollection = schema.collections[(field as RelationFieldType).collection]
    const { labels, recordTitleField, fullTextSearch, softDelete } = relationCollection
    const customization = getCollectionConfigModule(labels.collection)
    const formCustomization = getCollectionConfigModule(collection.labels.collection)
    const fieldCustomization = getFieldCustomization(field, formCustomization)
    const isCollectionPreloadCacheEnabled = preloadCacheEnabled(relationCollection)
    const isCollectionServerReadOnly = serverReadOnly(relationCollection)
    const goToRecord = useGoToRecord()

    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingImmediate, setIsLoadingImmediate] = useState(false)
    const [data, setData] = useState<StokerRecord[] | undefined>(undefined)
    const [searchValue, setSearchValue] = useState<string>("")
    const [prevSearchValue, setPrevSearchValue] = useState<string>("")
    const [inputValue, setValue] = useState<string>("")
    const [display, setDisplay] = useState<string>("")
    const [collectionTitle, setCollectionTitle] = useState<string>("")
    const [liveUpdate, setLiveUpdate] = useState(false)

    const pickerDebounceTimeout = useRef<NodeJS.Timeout>()

    const loadRelation = useCallback(async () => {
        if (isRelationField(field) && ["OneToOne", "OneToMany"].includes(field.type)) {
            const relationData = value || record?.[field.name]
            if (relationData && Object.keys(relationData).length > 0) {
                const relationId = Object.keys(relationData)[0]
                setValue(relationId)
                // eslint-disable-next-line security/detect-object-injection
                const relationRecord = relationData[relationId]
                if (relationRecord && typeof relationRecord === "object") {
                    if (fieldCustomization.admin?.modifyResultTitle) {
                        setDisplay(fieldCustomization.admin.modifyResultTitle(relationRecord, collection, record))
                    } else {
                        setDisplay(relationRecord[relationCollection.recordTitleField || "id"] || relationId)
                    }
                } else {
                    setDisplay(relationId)
                }
            } else {
                setValue("no_selection")
                setDisplay("----")
            }
        }
    }, [field, record, value])

    useEffect(() => {
        loadRelation()
    }, [formResetKey, loadRelation])

    useEffect(() => {
        if (liveUpdate) {
            loadRelation()
        }
    }, [record?.[field.name], value, loadRelation])

    useEffect(() => {
        const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
            "collections",
            labels.collection,
            "admin",
        ]
        const initialize = async () => {
            loadRelation()

            const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
            setCollectionTitle(titles?.collection || labels.collection)
            const admin = fieldCustomization.admin
            const fieldLiveUpdate = await tryPromise(admin?.live)
            if (liveUpdate || fieldLiveUpdate) {
                setLiveUpdate(true)
            }
        }
        initialize()
    }, [])

    const getData = useCallback(
        async (query: string | undefined, constraints: [string, "==" | "in", unknown][] = []) => {
            setIsLoadingImmediate(true)

            clearTimeout(pickerDebounceTimeout.current)

            setIsLoading(false)

            pickerDebounceTimeout.current = setTimeout(() => {
                setIsLoading(true)
            }, 500)

            let newConstraints: QueryConstraint[] | [string, WhereFilterOp, unknown][] = []
            if (isCollectionServerReadOnly) {
                newConstraints = constraints
            } else {
                newConstraints = constraints.map((constraint) => where(constraint[0], constraint[1], constraint[2]))
            }
            if (isCollectionServerReadOnly) {
                if (softDelete) {
                    newConstraints.push(["Archived", "==", false] as QueryConstraint & [string, WhereFilterOp, unknown])
                }
            } else {
                if (softDelete) {
                    newConstraints.push(
                        where("Archived", "==", false) as QueryConstraint & [string, WhereFilterOp, unknown],
                    )
                }
            }
            const currentRecord = record || form.getValues()
            if (
                "enforceHierarchy" in field &&
                field.enforceHierarchy &&
                currentRecord?.[field.enforceHierarchy.field]
            ) {
                newConstraints.push(
                    where(
                        `${field.enforceHierarchy.recordLinkField}_Array`,
                        "array-contains",
                        Object.keys(currentRecord?.[field.enforceHierarchy.field])[0],
                    ) as QueryConstraint & [string, WhereFilterOp, unknown],
                )
            }

            if (fullTextSearch && !isCollectionPreloadCacheEnabled && query) {
                const disjunctions = getFilterDisjunctions(relationCollection)
                const hitsPerPage = disjunctions === 0 ? 10 : Math.min(10, Math.max(1, Math.floor(30 / disjunctions)))
                const objectIDs = await performFullTextSearch(relationCollection, query, hitsPerPage, constraints)
                if (objectIDs.length > 0) {
                    if (isCollectionServerReadOnly) {
                        newConstraints.push(["id", "in", objectIDs] as QueryConstraint &
                            [string, WhereFilterOp, unknown])
                    } else {
                        newConstraints.push(
                            where("id", "in", objectIDs) as QueryConstraint & [string, WhereFilterOp, unknown],
                        )
                    }
                } else if (query) {
                    clearTimeout(pickerDebounceTimeout.current)
                    setData([])
                    setIsLoadingImmediate(false)
                    setIsLoading(false)
                    return
                }
            }

            const orderData = async (data: StokerRecord[]) => {
                const defaultSort = await tryPromise(customization.admin?.defaultSort)
                if (defaultSort) {
                    return sortList(
                        relationCollection,
                        data,
                        defaultSort.field,
                        defaultSort.direction,
                        collection,
                        record,
                    )
                } else {
                    return data.sort((a, b) => a[recordTitleField || "id"].localeCompare(b[recordTitleField || "id"]))
                }
            }

            // TODO: subcollection support
            getSome([labels.collection], newConstraints, {
                only: isCollectionPreloadCacheEnabled ? "cache" : undefined,
                pagination: isCollectionPreloadCacheEnabled ? undefined : { number: 10 },
                noEmbeddingFields: true,
            }).then((data) => {
                clearTimeout(pickerDebounceTimeout.current)

                if (isCollectionPreloadCacheEnabled && query) {
                    const searchResults = localFullTextSearch(relationCollection, query, data.docs, (result) => {
                        if (!fieldCustomization.admin?.filterResults) return true
                        return !!fieldCustomization.admin?.filterResults?.(result, collection, record)
                    })
                    const objectIds = searchResults.map((result) => result.id)
                    orderData(data.docs.filter((doc) => objectIds.includes(doc.id)).slice(0, 10)).then((data) => {
                        setData(data)
                    })
                } else {
                    orderData(
                        data.docs
                            .filter((doc) => {
                                if (!isCollectionPreloadCacheEnabled) return true
                                if (!fieldCustomization.admin?.filterResults) return true
                                return !!fieldCustomization.admin?.filterResults?.(
                                    doc as unknown as SearchResult,
                                    collection,
                                    record,
                                )
                            })
                            .slice(0, 10),
                    ).then((data) => {
                        setData(data)
                    })
                }
                setIsLoadingImmediate(false)
                setIsLoading(false)
            })
        },
        [record, form],
    )

    const handleOneToChange = useCallback(
        (value?: StokerRecord) => {
            if (!isRelationField(field)) return
            if (["OneToOne", "OneToMany"].includes(field.type)) {
                if (!value) {
                    form.setValue(field.name, {})
                    return
                }
                form.setValue(field.name, { [value.id]: value })
            }
        },
        [form],
    )

    const handleManyToChange = useCallback(
        async (inputValue: string) => {
            if (!isRelationField(field)) return
            if (["ManyToOne", "ManyToMany"].includes(field.type)) {
                let relation = data?.find((record) => record.id === inputValue)
                if (!relation) {
                    // TODO: subcollection support
                    relation = await getOne([relationCollection.labels.collection], inputValue, {
                        noEmbeddingFields: true,
                    })
                }
                form.setValue(field.name, { ...form.getValues(field.name), [inputValue]: relation })
            }
        },
        [data, form],
    )

    const debounceTimeout = useRef<NodeJS.Timeout>()

    useEffect(() => {
        if (!isRelationField(field)) return
        const relationCollection = schema.collections[field.collection]
        if (!relationCollection?.fullTextSearch) return
        const isCollectionPreloadCacheEnabled = preloadCacheEnabled(relationCollection)
        if (searchValue !== prevSearchValue) {
            if (debounceTimeout.current) {
                clearTimeout(debounceTimeout.current)
            }
            debounceTimeout.current = setTimeout(
                () => {
                    startTransition(() => {
                        getData(searchValue, field.constraints)
                    })
                },
                isCollectionPreloadCacheEnabled ? 250 : 750,
            )
        }
        setPrevSearchValue(searchValue)
    }, [searchValue])

    let popoverHeight = "h-auto"
    if (window.innerHeight < 600) {
        popoverHeight = "h-48"
    }

    return (
        <FormField
            control={form.control}
            name={field.name}
            render={() => (
                <div>
                    <FormItem>
                        <FormLabelWithIcon
                            collection={collection}
                            label={label}
                            field={field}
                            operation={operation}
                            icon={icon}
                            form={form}
                        />
                        <FormControl>
                            <Popover
                                modal={true}
                                open={isOpen}
                                onOpenChange={() => {
                                    setIsOpen(!isOpen)
                                    startTransition(() => {
                                        getData(searchValue, (field as RelationFieldType).constraints)
                                    })
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={isOpen}
                                            className="w-full justify-between"
                                            disabled={isDisabled || readOnly}
                                        >
                                            <span className="break-all whitespace-pre-wrap line-clamp-1 text-left">
                                                {inputValue ? display : ""}
                                            </span>
                                            <ChevronsUpDown className="opacity-50 h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                </div>
                                <PopoverContent
                                    className={cn(popoverHeight, "w-[200px]", "sm:w-[280px]", "p-0", "h-60")}
                                    align="start"
                                >
                                    <Command
                                        filter={() => {
                                            return 1
                                        }}
                                    >
                                        <CommandInput
                                            placeholder={`Search ${collectionTitle}...`}
                                            className="h-9"
                                            value={searchValue}
                                            onValueChange={(value) => {
                                                setSearchValue(value)
                                            }}
                                        />
                                        <CommandList>
                                            <CommandEmpty>
                                                {isOpen &&
                                                    (isLoading ? (
                                                        <LoadingSpinner size={7} className="m-auto" />
                                                    ) : !isLoadingImmediate ? (
                                                        `No ${collectionTitle} found.`
                                                    ) : null)}
                                            </CommandEmpty>
                                            {(!isLoading || isCollectionPreloadCacheEnabled) && (
                                                <CommandGroup>
                                                    {data && ["OneToOne", "OneToMany"].includes(field.type) && (
                                                        <CommandItem
                                                            key="no_selection"
                                                            value="no_selection"
                                                            onSelect={(currentValue: string) => {
                                                                setIsOpen(false)
                                                                if (currentValue !== inputValue) {
                                                                    setValue(currentValue)
                                                                    setDisplay("----")
                                                                    startTransition(() => {
                                                                        handleOneToChange()
                                                                    })
                                                                }
                                                            }}
                                                        >
                                                            ----
                                                        </CommandItem>
                                                    )}
                                                    {data?.map((relationRecord: StokerRecord) => (
                                                        <CommandItem
                                                            key={relationRecord.id}
                                                            value={relationRecord.id}
                                                            onSelect={(currentValue) => {
                                                                setIsOpen(false)
                                                                if (currentValue !== inputValue) {
                                                                    if (
                                                                        ["OneToOne", "OneToMany"].includes(field.type)
                                                                    ) {
                                                                        setValue(currentValue)
                                                                        if (
                                                                            fieldCustomization.admin?.modifyResultTitle
                                                                        ) {
                                                                            setDisplay(
                                                                                fieldCustomization.admin.modifyResultTitle(
                                                                                    relationRecord,
                                                                                    collection,
                                                                                    record,
                                                                                ),
                                                                            )
                                                                        } else {
                                                                            setDisplay(
                                                                                relationRecord[
                                                                                    recordTitleField || "id"
                                                                                ],
                                                                            )
                                                                        }
                                                                    }
                                                                    startTransition(() => {
                                                                        handleOneToChange(
                                                                            data?.find(
                                                                                (relationRecord) =>
                                                                                    relationRecord.id === currentValue,
                                                                            ),
                                                                        )
                                                                        if (
                                                                            ["ManyToOne", "ManyToMany"].includes(
                                                                                field.type,
                                                                            )
                                                                        ) {
                                                                            handleManyToChange(currentValue)
                                                                        }
                                                                    })
                                                                }
                                                            }}
                                                        >
                                                            {fieldCustomization.admin?.modifyResultTitle
                                                                ? fieldCustomization.admin.modifyResultTitle(
                                                                      relationRecord,
                                                                      collection,
                                                                      record,
                                                                  )
                                                                : relationRecord[recordTitleField || "id"]}
                                                            <Check
                                                                className={cn(
                                                                    "ml-auto",
                                                                    inputValue === relationRecord.id
                                                                        ? "opacity-100"
                                                                        : "opacity-0",
                                                                )}
                                                            />
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            )}
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </FormControl>
                        {description && <FormDescription>{description}</FormDescription>}
                        <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                    </FormItem>
                    <div className="mt-4">
                        {["ManyToOne", "ManyToMany"].includes(field.type) &&
                            value &&
                            Object.entries(value as StokerRelationObject)?.map(
                                ([relationId, relation]: [string, StokerRelation], index: number) => {
                                    return (
                                        <div key={index} className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="link"
                                                className="px-0"
                                                disabled={isDisabled}
                                                onClick={() => {
                                                    goToRecord(
                                                        relationCollection,
                                                        {
                                                            id: relationId,
                                                            ...relation,
                                                        } as unknown as StokerRecord,
                                                        field as RelationFieldType,
                                                    )
                                                }}
                                            >
                                                <span className="justify-between text-blue-500 max-w-[750px] break-all whitespace-pre-wrap line-clamp-1 text-ellipsis text-left">
                                                    {fieldCustomization.admin?.modifyResultTitle
                                                        ? fieldCustomization.admin.modifyResultTitle(
                                                              {
                                                                  id: relationId,
                                                                  ...relation,
                                                              } as unknown as StokerRecord,
                                                              collection,
                                                              record,
                                                          )
                                                        : relation[relationCollection.recordTitleField || "id"]}
                                                </span>
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="p-1"
                                                onClick={() => {
                                                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                                    const { [relationId]: _, ...rest } = form.getValues(
                                                        field.name,
                                                    ) as StokerRelation
                                                    form.setValue(field.name, rest)
                                                }}
                                                disabled={isDisabled}
                                            >
                                                <XCircle className="w-5 h-5" />
                                            </Button>
                                        </div>
                                    )
                                },
                            )}
                    </div>
                </div>
            )}
        />
    )
}

function ComputedField({ form, collection, label, description, field, record, icon }: FieldProps) {
    const customization = getCollectionConfigModule(collection.labels.collection)
    const [connectionStatus] = useConnection()
    const goToRecord = useGoToRecord()
    const values = { ...record, ...form.getValues() } as StokerRecord
    return (
        <FormItem>
            <FormLabelWithIcon
                collection={collection}
                label={label}
                field={field}
                operation="update"
                icon={icon}
                form={form}
            />
            <FormControl>
                <div>
                    {getFormattedFieldValue(
                        customization,
                        field,
                        values,
                        connectionStatus,
                        undefined,
                        goToRecord,
                        true,
                    )}
                </div>
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
        </FormItem>
    )
}

function RecordForm({
    collection,
    operation,
    path,
    isLoading,
    record,
    draft,
    onSuccess,
    onSaveRecord,
    rowSelection,
    fromRelationList,
}: FormProps) {
    const { labels, access, fields, auth, recordTitleField, softDelete, relationLists } = collection
    const tenantId = getTenant()
    const schema = getSchema()
    const softDeleteField = softDelete?.archivedField
    const softDeleteTimestampField = softDelete?.timestampField
    const { serverWriteOnly } = access
    const navigate = useNavigate()
    const params = useParams()
    const { id } = params as { id: string }
    if (operation === "update" && !id) {
        throw new Error("ID param is required for update operation")
    }
    const db = getFirestore()
    const storage = getStorage()
    const firebaseAuth = getAuth()
    const currentUser = firebaseAuth.currentUser
    const globalConfig = getGlobalConfigModule()
    const permissions = getCurrentUserPermissions()
    const collectionPermissions = permissions?.collections?.[collection.labels.collection]
    if (!collectionPermissions) {
        throw new Error("PERMISSION_DENIED")
    }
    const customization = getCollectionConfigModule(collection.labels.collection)
    const isServerReadOnly = serverReadOnly(collection)
    const { toast } = useToast()

    const onFormOpenCalledRef = useRef(false)

    const defaultValues: Partial<StokerRecord> = useMemo(() => {
        const defaultValues: Partial<StokerRecord> = {}
        for (const field of fields) {
            if (field.type === "Embedding") continue
            if (auth && field.name === "User_ID") continue
            if (operation === "update-many" && "unique" in field && field.unique) continue
            if (record?.[field.name] !== undefined) {
                defaultValues[field.name] = record?.[field.name]
            }
            if (auth && collectionPermissions.auth) {
                defaultValues.password = ""
                defaultValues.passwordConfirm = ""
            }
        }
        return defaultValues
    }, [fields, record])

    const formSchema = getInputSchema(collection, schema, customization, undefined, operation === "update-many")
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues,
    })

    const formValues = form.watch()
    const [prevState, setPrevState] = useState<Partial<StokerRecord>>({} as Partial<StokerRecord>)
    const [originalRecord, setOriginalRecord] = useState<StokerRecord | undefined>(undefined)
    const [formResetKey, setFormResetKey] = useState(0)
    const [formSavedKey, setFormSavedKey] = useState(0)

    const [hidden, setHidden] = useState(false)
    const [collectionTitle, setCollectionTitle] = useState("")
    const [allTitles, setAllTitles] = useState<Record<StokerCollection, string>>({})
    const [allRecordTitles, setAllRecordTitles] = useState<Record<StokerCollection, string>>({})
    const [recordTitle, setRecordTitle] = useState(undefined)
    const [meta, setMeta] = useState<CollectionMeta | undefined>(undefined)
    const [breadcrumbs, setBreadcrumbs] = useState<string[] | undefined>(undefined)
    const [enableDuplicate, setEnableDuplicate] = useState(false)
    const [disableCreate, setDisableCreate] = useState<boolean>(false)
    const [isDuplicate, setIsDuplicate] = useState(false)
    const [collectionPath, setCollectionPath] = useState<string[] | undefined>(undefined)

    const {
        setOptimisticUpdate,
        setOptimisticDelete,
        removeOptimisticUpdate,
        removeOptimisticDelete,
        removeCacheOptimistic,
    } = useOptimistic()
    const [isDirty, setIsDirty] = useState(false)
    const [isDisabled, setIsDisabled] = useState(operation === "update")

    const [isFormReady, setIsFormReady] = useState(0)
    const { isGlobalLoading, setGlobalLoading } = useGlobalLoading()
    const [error, setError] = useState<string | null>(null)
    const [isOfflineCreateDisabled, setIsOfflineCreateDisabled] = useState<boolean | undefined>(undefined)
    const [isOfflineUpdateDisabled, setIsOfflineUpdateDisabled] = useState<boolean | undefined>(undefined)
    const [isOfflineDeleteDisabled, setIsOfflineDeleteDisabled] = useState<boolean | undefined>(undefined)
    const [offlinePersistenceType, setOfflinePersistenceType] = useState<string | undefined>(undefined)
    const [showDraftDialog, setShowDraftDialog] = useState(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [draftData, setDraftData] = useState<any>(null)
    const [showDuplicateModal, setShowDuplicateModal] = useState(false)
    const [duplicateRecordData, setDuplicateRecordData] = useState<Partial<StokerRecord> | undefined>(undefined)
    const [convert, setConvert] = useState<Convert[] | undefined>(undefined)
    const [convertAllowed, setConvertAllowed] = useState<Record<string, boolean>>({})
    const [showConvertModal, setShowConvertModal] = useState(false)
    const [convertRecordData, setConvertRecordData] = useState<Partial<StokerRecord> | undefined>(undefined)
    const [convertTargetCollection, setConvertTargetCollection] = useState<CollectionSchema | undefined>(undefined)
    const [customFields, setCustomFields] = useState<CustomField[] | undefined>(undefined)
    const [formButtons, setFormButtons] = useState<FormButton[] | undefined>(undefined)
    const [formLists, setFormLists] = useState<FormList[] | undefined>(undefined)

    const [connectionStatus] = useConnection()
    const isOffline = connectionStatus === "offline"
    const isCreateDisabled =
        (!!disableCreate && operation === "create") ||
        (isOffline && !!(isOfflineCreateDisabled || serverWriteOnly || formValues.operation))
    const isUpdateDisabled =
        isOffline && !!(isOfflineUpdateDisabled || serverWriteOnly || formValues.operation || originalRecord?.User_ID)
    const isDeleteDisabled = isOffline && !!(isOfflineDeleteDisabled || serverWriteOnly || originalRecord?.User_ID)

    const hasCreateAccess = useMemo(() => {
        return collectionAccess("Create", collectionPermissions)
    }, [collection, permissions])
    const hasUpdateAccess = useMemo(() => {
        return collectionAccess("Update", collectionPermissions)
    }, [collection, permissions])
    const hasDeleteAccess = useMemo(() => {
        return (
            (!softDelete && collectionAccess("Delete", collectionPermissions)) ||
            (softDelete && collectionAccess("Update", collectionPermissions))
        )
    }, [collection, permissions])

    const isPending = !!(id && isGlobalLoading.has(id))
    const isPendingServer = !!(id && isGlobalLoading.get(id)?.server)
    const [isAddingServer, setIsAddingServer] = useState(false)
    const [isUploading, setIsUploading] = useState<Record<string, boolean>>({})
    const [isSaving, setIsSaving] = useState(false)

    const [formUploadEnabled, setFormUploadEnabled] = useState(false)
    const [formImagesEnabled, setFormImagesEnabled] = useState(false)
    const [carouselImages, setCarouselImages] = useState<string[]>([])
    const [carouselLoading, setCarouselLoading] = useState(true)
    const carouselRef = useRef<HTMLDivElement | null>(null)
    const [showFilenameDialog, setShowFilenameDialog] = useState(false)
    const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null)
    const [pendingUploadField, setPendingUploadField] = useState<string | null>(null)
    const [editingFilename, setEditingFilename] = useState("")
    const [showPermissionsDialog, setShowPermissionsDialog] = useState(false)
    const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([])
    const [isMultipleFileUpload, setIsMultipleFileUpload] = useState(false)
    const [permissionsContext, setPermissionsContext] = useState<"files" | "image-create" | "image-update">("files")
    const [pendingImageFieldName, setPendingImageFieldName] = useState<string | null>(null)
    const [pendingImageForUpdate, setPendingImageForUpdate] = useState<{ fieldName: string; file: File } | null>(null)
    const [imageUpdateResolver, setImageUpdateResolver] = useState<null | (() => void)>(null)

    type QueuedUpload = { files: File[]; permissions: FilePermissions; customFilename?: string }
    const [queuedUploads, setQueuedUploads] = useState<QueuedUpload[]>([])
    const [queuedImageUploads, setQueuedImageUploads] = useState<
        Record<string, { file: File; permissions: FilePermissions }>
    >({})

    const computeBasePath = useCallback(
        (targetId: string) => {
            const baseArray = (collectionPath || record?.Collection_Path || path) as string[]
            return `${tenantId}/${baseArray.join("/")}/${targetId}`
        },
        [collectionPath, record, path],
    )

    const uploadFilesToRecord = useCallback(
        async (targetId: string, files: File[] | FileList, permissions: FilePermissions, customFilename?: string) => {
            if (!files || !currentUser) return
            const fileArray = Array.from(files)
            const basePath = computeBasePath(targetId)

            const targetRecord = {
                id: targetId,
                Collection_Path: path || [],
                ...record,
            } as StokerRecord

            for (const file of fileArray) {
                const filename = (customFilename || file.name).trim()
                const validationError = validateStorageName(filename)
                if (validationError) {
                    toast({ title: "Invalid file name", description: validationError, variant: "destructive" })
                    continue
                }
                const filePath = `${basePath}/${filename}`
                const storageRef = ref(storage, filePath)
                const metadata = {
                    customMetadata: {
                        read: permissions?.read || "",
                        update: permissions?.update || "",
                        delete: permissions?.delete || "",
                        createdBy: currentUser.uid,
                    },
                }

                try {
                    await runHooks("preFileAdd", globalConfig, customization, [
                        targetRecord,
                        filePath,
                        filename,
                        {
                            read: metadata.customMetadata.read,
                            update: metadata.customMetadata.update,
                            delete: metadata.customMetadata.delete,
                        },
                    ])
                } catch {
                    continue
                }

                const uploadTask = uploadBytesResumable(storageRef, file, metadata)
                await new Promise<void>((resolve) => {
                    uploadTask.on(
                        "state_changed",
                        undefined,
                        () => {
                            toast({
                                title: "Upload failed",
                                description: `Failed to upload ${filename}`,
                                variant: "destructive",
                            })
                            resolve()
                        },
                        async () => {
                            toast({ title: "Upload successful", description: `${filename} uploaded successfully` })

                            try {
                                await runHooks("postFileAdd", globalConfig, customization, [
                                    targetRecord,
                                    filePath,
                                    filename,
                                    {
                                        read: metadata.customMetadata.read,
                                        update: metadata.customMetadata.update,
                                        delete: metadata.customMetadata.delete,
                                    },
                                ])
                            } catch {
                                return
                            }

                            resolve()
                        },
                    )
                })
            }
        },
        [computeBasePath, currentUser, path, record],
    )

    const enqueueImageForCreate = useCallback((fieldName: string, file: File) => {
        setPermissionsContext("image-create")
        setPendingImageFieldName(fieldName)
        setPendingUploadFile(file)
        setPendingUploadField(fieldName)
        setEditingFilename(file.name)
        setIsMultipleFileUpload(false)
        setShowPermissionsDialog(true)
    }, [])

    const uploadImageForUpdate = useCallback(async (fieldName: string, file: File) => {
        return await new Promise<void>((resolve) => {
            setPermissionsContext("image-update")
            setPendingImageForUpdate({ fieldName, file })
            setEditingFilename(file.name)
            setIsMultipleFileUpload(false)
            setShowPermissionsDialog(true)
            setImageUpdateResolver(() => resolve)
        })
    }, [])

    const handleFormFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files) return
        if (files.length === 1) {
            const file = files[0]
            setPendingUploadFile(file)
            setPendingUploadField(null)
            setEditingFilename(file.name)
            setIsMultipleFileUpload(false)
            setShowFilenameDialog(true)
        } else {
            setPendingUploadFiles(Array.from(files))
            setIsMultipleFileUpload(true)
            setShowPermissionsDialog(true)
        }
        event.target.value = ""
    }, [])

    const handleConfirmFilename = useCallback(() => {
        if (!pendingUploadFile) return
        const trimmed = editingFilename.trim()
        const validationError = validateStorageName(trimmed)
        if (validationError) {
            toast({ title: "Invalid file name", description: validationError, variant: "destructive" })
            return
        }
        setShowPermissionsDialog(true)
    }, [pendingUploadFile, editingFilename])

    const handlePermissionsConfirm = useCallback(
        async (selectedPermissions: FilePermissions) => {
            if (permissionsContext === "files") {
                if (isMultipleFileUpload) {
                    if (pendingUploadFiles.length > 0) {
                        setQueuedUploads((prev) => [
                            ...prev,
                            { files: pendingUploadFiles, permissions: selectedPermissions },
                        ])
                    }
                } else {
                    if (!pendingUploadFile) return
                    setQueuedUploads((prev) => [
                        ...prev,
                        {
                            files: [pendingUploadFile],
                            permissions: selectedPermissions,
                            customFilename: editingFilename.trim(),
                        },
                    ])
                }
                setShowFilenameDialog(false)
                setShowPermissionsDialog(false)
                setPendingUploadFile(null)
                setPendingUploadField(null)
                setEditingFilename("")
                setPendingUploadFiles([])
                setIsMultipleFileUpload(false)
                setPermissionsContext("files")
                return
            }

            if (permissionsContext === "image-create") {
                if (!pendingUploadFile || !pendingImageFieldName) return
                setQueuedImageUploads((prev) => ({
                    ...prev,
                    [pendingImageFieldName]: { file: pendingUploadFile, permissions: selectedPermissions },
                }))
                setShowPermissionsDialog(false)
                setPendingUploadFile(null)
                setPendingUploadField(null)
                setEditingFilename("")
                setPendingImageFieldName(null)
                setPermissionsContext("files")
                return
            }

            if (permissionsContext === "image-update") {
                if (!pendingImageForUpdate || !id || !currentUser) return
                const { fieldName, file } = pendingImageForUpdate
                const basePath = computeBasePath(id)
                const filename = file.name.trim()
                const validationError = validateStorageName(filename)
                if (validationError) {
                    toast({ title: "Invalid file name", description: validationError, variant: "destructive" })
                    setShowPermissionsDialog(false)
                    setPendingImageForUpdate(null)
                    setPermissionsContext("files")
                    if (imageUpdateResolver) {
                        setIsUploading((prev) => ({ ...prev, [fieldName]: false }))
                        imageUpdateResolver()
                    }
                    return
                }
                const filePath = `${basePath}/${filename}`
                const storageRef = ref(storage, filePath)
                const metadata = {
                    customMetadata: {
                        read: selectedPermissions.read || "",
                        update: selectedPermissions.update || "",
                        delete: selectedPermissions.delete || "",
                        createdBy: currentUser.uid,
                    },
                }
                const targetRecord = {
                    id,
                    Collection_Path: path || [],
                    ...record,
                } as StokerRecord
                try {
                    await runHooks("preFileAdd", globalConfig, customization, [
                        targetRecord,
                        filePath,
                        filename,
                        {
                            read: metadata.customMetadata.read,
                            update: metadata.customMetadata.update,
                            delete: metadata.customMetadata.delete,
                        },
                    ])
                } catch {
                    setShowPermissionsDialog(false)
                    setPendingImageForUpdate(null)
                    setPermissionsContext("files")
                    if (imageUpdateResolver) {
                        setIsUploading((prev) => ({ ...prev, [fieldName]: false }))
                        imageUpdateResolver()
                    }
                    return
                }
                await new Promise<void>((resolve) => {
                    const uploadTask = uploadBytesResumable(storageRef, file, metadata)
                    uploadTask.on(
                        "state_changed",
                        undefined,
                        () => {
                            setIsUploading((prev) => ({ ...prev, [fieldName]: false }))
                            toast({
                                title: "Upload failed",
                                description: `Failed to upload ${filename}`,
                                variant: "destructive",
                            })
                        },
                        async () => {
                            try {
                                await runHooks("postFileAdd", globalConfig, customization, [
                                    targetRecord,
                                    filePath,
                                    filename,
                                    {
                                        read: metadata.customMetadata.read,
                                        update: metadata.customMetadata.update,
                                        delete: metadata.customMetadata.delete,
                                    },
                                ])
                            } catch {
                                resolve()
                                return
                            }
                            resolve()
                        },
                    )
                })
                const url = await getDownloadURL(storageRef)
                form.setValue(fieldName, url, { shouldDirty: true })
                setShowPermissionsDialog(false)
                setPendingImageForUpdate(null)
                setPermissionsContext("files")
                if (imageUpdateResolver) {
                    setIsUploading((prev) => ({ ...prev, [fieldName]: false }))
                    imageUpdateResolver()
                }
                return
            }
        },
        [
            permissionsContext,
            isMultipleFileUpload,
            pendingUploadFiles,
            pendingUploadFile,
            editingFilename,
            id,
            currentUser,
            computeBasePath,
            path,
            record,
            form,
            pendingImageFieldName,
            pendingImageForUpdate,
            imageUpdateResolver,
        ],
    )

    const handlePermissionsCancel = useCallback(() => {
        if (permissionsContext === "image-create" && pendingImageFieldName) {
            setTimeout(() => {
                form.setValue(pendingImageFieldName, undefined, { shouldDirty: true })
            }, 250)
        }
        if (permissionsContext === "image-update" && imageUpdateResolver) {
            if (pendingUploadField) {
                setIsUploading((prev) => ({ ...prev, [pendingUploadField]: false }))
            }
            imageUpdateResolver()
        }
        setShowPermissionsDialog(false)
        setPendingUploadFiles([])
        setIsMultipleFileUpload(false)
        setPendingUploadFile(null)
        setPendingUploadField(null)
        setPendingImageFieldName(null)
        setPendingImageForUpdate(null)
        setImageUpdateResolver(null)
        setPermissionsContext("files")
    }, [permissionsContext, pendingImageFieldName, form, imageUpdateResolver, pendingUploadField])

    const renderCustomField = (customField: CustomField, index: number) => {
        if (!customField.component) return null

        const CustomComponent = customField.component as React.FC<CustomFieldProps & Record<string, unknown>>
        return (
            <div key={`custom-field-${index}`}>
                <CustomComponent
                    operation={operation}
                    form={form}
                    collection={collection}
                    record={record}
                    isDisabled={isDisabled}
                    isUpdateDisabled={isUpdateDisabled}
                    formResetKey={formResetKey}
                    {...customField.props}
                />
            </div>
        )
    }

    const renderFieldsWithCustomFields = () => {
        if (!customFields || customFields.length === 0) {
            return fields.map((field) => {
                const value = formValues[field.name]
                return (
                    <RecordFormField
                        key={field.name}
                        setIsFormReady={setIsFormReady}
                        operation={operation}
                        form={form}
                        collection={collection}
                        field={field}
                        record={record}
                        value={value}
                        isDisabled={isDisabled}
                        isUpdateDisabled={isUpdateDisabled}
                        formResetKey={formResetKey}
                        isUploading={isUploading}
                        setIsUploading={setIsUploading}
                        enqueueImageForCreate={enqueueImageForCreate}
                        uploadImageForUpdate={uploadImageForUpdate}
                    />
                )
            })
        }

        const combinedItems: Array<{ type: "field" | "custom"; item: CollectionField | CustomField; index: number }> =
            []
        fields.forEach((field, index) => {
            const fieldCustomization = getFieldCustomization(field, customization)
            const fieldPosition = tryFunction(fieldCustomization.admin?.column) ?? index
            combinedItems.push({ type: "field", item: field, index: fieldPosition })
        })

        customFields.forEach((customField, customIndex) => {
            if (
                customField.condition &&
                !customField.condition(operation, { ...(form.getValues() as StokerRecord), id: record?.id })
            )
                return
            let position = 0
            if (typeof customField.position === "function") {
                position =
                    customField.position({ ...(form.getValues() as StokerRecord), id: record?.id }) ??
                    fields.length + customIndex
            } else {
                position = customField.position ?? fields.length + customIndex
            }
            combinedItems.push({ type: "custom", item: customField, index: position })
        })

        combinedItems.sort((a, b) => a.index - b.index)

        return combinedItems.map((item, renderIndex) => {
            if (item.type === "field") {
                const field = item.item as CollectionField
                const value = formValues[field.name]
                return (
                    <RecordFormField
                        key={field.name}
                        setIsFormReady={setIsFormReady}
                        operation={operation}
                        form={form}
                        collection={collection}
                        field={field}
                        record={record}
                        path={path}
                        value={value}
                        isDisabled={isDisabled}
                        isUpdateDisabled={isUpdateDisabled}
                        formResetKey={formResetKey}
                        isUploading={isUploading}
                        setIsUploading={setIsUploading}
                        enqueueImageForCreate={enqueueImageForCreate}
                        uploadImageForUpdate={uploadImageForUpdate}
                    />
                )
            } else {
                const customField = item.item as CustomField
                return renderCustomField(customField, renderIndex)
            }
        })
    }

    const isAssignable = (permissionsCollection: CollectionSchema) => {
        const { access } = permissionsCollection
        const roleForAssignability = record?.Role || formValues.Role
        return (
            access.operations.assignable === true ||
            (typeof access.operations.assignable === "object" &&
                access.operations.assignable.includes(roleForAssignability))
        )
    }

    const defaultAccess = useCallback(
        (permissionsCollection: CollectionSchema, operation: string) => {
            const { access } = permissionsCollection
            return !!(
                (access.operations[operation.toLowerCase() as keyof AccessOperations] as string[])?.includes(
                    record?.Role || formValues.Role,
                ) && !isAssignable(permissionsCollection)
            )
        },
        [record, formValues.Role],
    )

    const defaultPermissionsValues = useMemo(() => {
        const defaultValues: Record<StokerCollection, string[]> = {}
        Object.values(schema.collections).forEach((permissionsCollection) => {
            const operations = ["Read", "Create", "Update", "Delete"]
            defaultValues[permissionsCollection.labels.collection] = []
            for (const operation of operations) {
                if (defaultAccess(permissionsCollection, operation)) {
                    defaultValues[permissionsCollection.labels.collection].push(operation)
                }
            }
        })
        return defaultValues
    }, [formValues.Role])

    useEffect(() => {
        if (!formValues.Role && !record?.Role) return
        resetPermissions()
        for (const permissionsCollection of Object.values(schema.collections)) {
            const operations = ["Read", "Create", "Update", "Delete"]
            const defaults: string[] = []
            for (const operation of operations) {
                if (defaultAccess(permissionsCollection, operation)) defaults.push(operation)
            }
            if (
                defaults.length > 0 ||
                form.getValues(`operations-${permissionsCollection.labels.collection}`) !== undefined
            ) {
                form.setValue(`operations-${permissionsCollection.labels.collection}`, defaults, { shouldDirty: true })
            }
        }
    }, [formValues.Role])

    useEffect(() => {
        if (isFormReady >= fields.length) {
            const modal = document.getElementById("create-record-modal")
            let cleanup: (() => void) | undefined
            if (modal) {
                cleanup = trapFocus(modal)
            }
            return () => {
                if (cleanup) cleanup()
            }
        }
        return
    }, [isFormReady])

    const getOriginalRecord = useCallback(
        async (initial = false) => {
            if (id) {
                if (!initial) {
                    const relationFields = getRelationFields(collection)
                    record = await getOne(path, id, {
                        noEmbeddingFields: true,
                        relations: { fields: relationFields, depth: 1 },
                    })
                }
                if (!record) return
                const originalRecord = cloneDeep(record)
                setCollectionPath(record.Collection_Path)
                deserializeTimestamps(originalRecord)
                setOriginalRecord(originalRecord)
                const filteredRecord = Object.fromEntries(
                    Object.entries(originalRecord).filter(
                        ([key]) =>
                            !(
                                systemFields.includes(key as SystemField) ||
                                key.endsWith("_Lowercase") ||
                                key.endsWith("_Array") ||
                                key.endsWith("_Single")
                            ),
                    ),
                )
                const prevState = cloneDeep(filteredRecord)
                const permissionValues = Object.fromEntries(
                    Object.entries(form.getValues()).filter(
                        ([key]) =>
                            key.startsWith("auth-") ||
                            key.startsWith("operations-") ||
                            key.startsWith("attribute-") ||
                            key.startsWith("restrict-") ||
                            key.startsWith("accessible-"),
                    ),
                )
                setPrevState({ ...prevState, ...permissionValues })
            }
        },
        [id, path, record],
    )

    const originalRecordLoaded = useRef(false)

    useEffect(() => {
        const load = async () => {
            const disableUpdate = await tryPromise(customization.admin?.disableUpdate, [operation, record])
            if (operation === "update" && id && record && !originalRecordLoaded.current && !isLoading?.current) {
                originalRecordLoaded.current = true
                await getOriginalRecord(true)
                if (disableUpdate) setIsDisabled(true)
                else setIsDisabled(false)
                if (!onFormOpenCalledRef.current && customization.admin?.onFormOpen) {
                    await customization.admin?.onFormOpen("update", record)
                    onFormOpenCalledRef.current = true
                }
            } else if (operation === "update" && id && record) {
                if (disableUpdate) setIsDisabled(true)
                else setIsDisabled(false)
            }
        }
        load()
    }, [record])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevEntities = useRef<Record<string, any> | undefined>(undefined)

    const resetPermissions = useCallback(() => {
        const formValues = form.getValues()
        prevEntities.current = cloneDeep(formValues)
        for (const collection of Object.values(schema.collections)) {
            if (
                !collectionAccess(
                    "Read",
                    permissions.collections?.[collection.labels.collection] as CollectionPermissions,
                )
            ) {
                continue
            }

            if (formValues[`auth-${collection.labels.collection}`] !== undefined) {
                form.setValue(`auth-${collection.labels.collection}`, false, {
                    shouldDirty: false,
                })
            }
            if (formValues[`operations-${collection.labels.collection}`]) {
                form.setValue(`operations-${collection.labels.collection}`, [], {
                    shouldDirty: false,
                })
            }
            if (formValues[`attribute-${collection.labels.collection}-Record_Owner`] !== undefined) {
                form.setValue(`attribute-${collection.labels.collection}-Record_Owner`, false, {
                    shouldDirty: false,
                })
            }
            if (formValues[`attribute-${collection.labels.collection}-Record_User`] !== undefined) {
                form.setValue(`attribute-${collection.labels.collection}-Record_User`, false, {
                    shouldDirty: false,
                })
            }
            if (formValues[`attribute-${collection.labels.collection}-Record_Property`] !== undefined) {
                form.setValue(`attribute-${collection.labels.collection}-Record_Property`, false, {
                    shouldDirty: false,
                })
            }
            if (formValues[`restrict-${collection.labels.collection}`] !== undefined) {
                form.setValue(`restrict-${collection.labels.collection}`, false, {
                    shouldDirty: false,
                })
            }
            for (const formValue of Object.keys(formValues)) {
                if (formValue.startsWith("accessible-")) {
                    form.setValue(
                        formValue,
                        {},
                        {
                            shouldDirty: false,
                        },
                    )
                }
            }
        }
    }, [form])

    const permissionsLoaded = useRef(false)
    const unsubscribe = useRef<Unsubscribe | undefined>(undefined)

    const role = record?.Role || formValues.Role

    const showPermissions = useMemo(() => {
        return (
            !access.permissionWriteRestrictions?.find((restriction) => restriction.userRole === permissions.Role) ||
            access.permissionWriteRestrictions?.find(
                (restriction) => restriction.userRole === permissions.Role && restriction.recordRole.includes(role),
            )
        )
    }, [permissions, record])

    useEffect(() => {
        const load = async () => {
            if (
                operation === "update" &&
                id &&
                collectionPermissions.auth &&
                originalRecord &&
                record?.User_ID &&
                (!permissionsLoaded.current || record?.User_ID !== originalRecord?.User_ID) &&
                !isLoading?.current &&
                showPermissions
            ) {
                unsubscribe.current?.()
                permissionsLoaded.current = true
                const unsubscribePermissions = onSnapshot(
                    doc(db, "tenants", tenantId, "system_user_permissions", record.User_ID),
                    { includeMetadataChanges: true },
                    (doc) => {
                        if (doc.metadata.fromCache) return
                        const permissionsData = doc.data() as StokerPermissions
                        if (permissionsData) {
                            resetPermissions()

                            for (const collection of Object.values(schema.collections)) {
                                if (permissionsData.collections?.[collection.labels.collection]) {
                                    const collectionPermissions =
                                        permissionsData.collections[collection.labels.collection]
                                    if (collectionPermissions.auth) {
                                        form.setValue(`auth-${collection.labels.collection}`, true, {
                                            shouldDirty: false,
                                        })
                                    }
                                    if (collectionPermissions.operations) {
                                        form.setValue(
                                            `operations-${collection.labels.collection}`,
                                            collectionPermissions.operations,
                                            { shouldDirty: false },
                                        )
                                    }
                                    if (collectionPermissions.restrictEntities) {
                                        form.setValue(`restrict-${collection.labels.collection}`, true, {
                                            shouldDirty: false,
                                        })
                                    }
                                    if (collectionPermissions.recordOwner) {
                                        form.setValue(`attribute-${collection.labels.collection}-Record_Owner`, true, {
                                            shouldDirty: false,
                                        })
                                    }
                                    if (collectionPermissions.recordUser) {
                                        form.setValue(`attribute-${collection.labels.collection}-Record_User`, true, {
                                            shouldDirty: false,
                                        })
                                    }
                                    if (collectionPermissions.recordProperty) {
                                        form.setValue(
                                            `attribute-${collection.labels.collection}-Record_Property`,
                                            true,
                                            { shouldDirty: false },
                                        )
                                    }
                                    if (collectionPermissions.individualEntities) {
                                        const assignment = collection.access.entityRestrictions?.restrictions?.find(
                                            (restriction) =>
                                                restriction.roles.some(
                                                    (role) =>
                                                        role.role === record?.Role && restriction.type === "Individual",
                                                ),
                                        )
                                        if (assignment) {
                                            collectionPermissions.individualEntities.map(async (entity) => {
                                                if (
                                                    // eslint-disable-next-line security/detect-object-injection
                                                    prevEntities.current?.[
                                                        `accessible-${collection.labels.collection}-${collection.labels.collection}`
                                                    ]?.[entity]
                                                ) {
                                                    const currentValue = form.getValues(
                                                        `accessible-${collection.labels.collection}-${collection.labels.collection}`,
                                                    )
                                                    form.setValue(
                                                        `accessible-${collection.labels.collection}-${collection.labels.collection}`,
                                                        {
                                                            ...currentValue,
                                                            [entity]:
                                                                // eslint-disable-next-line security/detect-object-injection
                                                                prevEntities.current?.[
                                                                    `accessible-${collection.labels.collection}-${collection.labels.collection}`
                                                                ]?.[entity],
                                                        },
                                                        { shouldDirty: false },
                                                    )
                                                    return
                                                }
                                                const relationFields = getRelationFields(collection)
                                                // TODO: subcollection support
                                                const record = await getOne([collection.labels.collection], entity, {
                                                    noEmbeddingFields: true,
                                                    relations: { fields: relationFields, depth: 1 },
                                                })
                                                if (record) {
                                                    const currentValue = form.getValues(
                                                        `accessible-${collection.labels.collection}-${collection.labels.collection}`,
                                                    )
                                                    form.setValue(
                                                        `accessible-${collection.labels.collection}-${collection.labels.collection}`,
                                                        { ...currentValue, [record.id]: record },
                                                        { shouldDirty: false },
                                                    )
                                                }
                                            })
                                        }
                                    }
                                    if (collectionPermissions.parentEntities) {
                                        const assignment = collection.access.entityRestrictions?.restrictions?.find(
                                            (restriction) =>
                                                restriction.roles.some(
                                                    (role) =>
                                                        role.role === record?.Role &&
                                                        (restriction.type === "Parent" ||
                                                            restriction.type === "Parent_Property"),
                                                ),
                                        )
                                        if (assignment?.type === "Parent" || assignment?.type === "Parent_Property") {
                                            const collectionField = getField(
                                                collection.fields,
                                                assignment?.collectionField,
                                            ) as RelationFieldType
                                            collectionPermissions.parentEntities.map(async (entity) => {
                                                if (
                                                    // eslint-disable-next-line security/detect-object-injection
                                                    prevEntities.current?.[
                                                        `accessible-${collection.labels.collection}-${collectionField.collection}`
                                                    ]?.[entity]
                                                ) {
                                                    const currentValue = form.getValues(
                                                        `accessible-${collection.labels.collection}-${collectionField.collection}`,
                                                    )
                                                    form.setValue(
                                                        `accessible-${collection.labels.collection}-${collectionField.collection}`,
                                                        {
                                                            ...currentValue,
                                                            [entity]:
                                                                // eslint-disable-next-line security/detect-object-injection
                                                                prevEntities.current?.[
                                                                    `accessible-${collection.labels.collection}-${collectionField.collection}`
                                                                ]?.[entity],
                                                        },
                                                        { shouldDirty: false },
                                                    )
                                                    return
                                                }
                                                const relationCollection =
                                                    schema.collections[collectionField.collection]
                                                const relationFields = getRelationFields(relationCollection)
                                                // TODO: subcollection support
                                                const record = await getOne([collectionField.collection], entity, {
                                                    noEmbeddingFields: true,
                                                    relations: { fields: relationFields, depth: 1 },
                                                })
                                                if (record) {
                                                    const currentValue = form.getValues(
                                                        `accessible-${collection.labels.collection}-${collectionField.collection}`,
                                                    )
                                                    form.setValue(
                                                        `accessible-${collection.labels.collection}-${collectionField.collection}`,
                                                        { ...currentValue, [record.id]: record },
                                                        { shouldDirty: false },
                                                    )
                                                }
                                            })
                                        }
                                    }
                                    if (collectionPermissions.parentPropertyEntities) {
                                        const assignment = collection.access.entityRestrictions?.restrictions?.find(
                                            (restriction) =>
                                                restriction.roles.some(
                                                    (role) =>
                                                        role.role === record?.Role &&
                                                        restriction.type === "Parent_Property",
                                                ),
                                        )
                                        if (assignment?.type === "Parent_Property") {
                                            const collectionField = getField(
                                                collection.fields,
                                                assignment?.collectionField,
                                            ) as RelationFieldType
                                            form.setValue(
                                                `accessible-${collection.labels.collection}-${collectionField.collection}`,
                                                collectionPermissions.parentPropertyEntities,
                                                { shouldDirty: false },
                                            )
                                        }
                                    }
                                }
                            }
                            setPrevState((prev) => ({
                                ...prev,
                                ...Object.fromEntries(
                                    Object.entries(form.getValues()).filter(
                                        ([key]) =>
                                            key.startsWith("auth-") ||
                                            key.startsWith("operations-") ||
                                            key.startsWith("attribute-") ||
                                            key.startsWith("restrict-") ||
                                            key.startsWith("accessible-"),
                                    ),
                                ),
                            }))
                        }
                    },
                )
                unsubscribe.current = unsubscribePermissions
            }
        }
        load()
    }, [record, originalRecord])

    const [isInitialized, setIsInitialized] = useState(false)

    useEffect(() => {
        const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
            "collections",
            labels.collection,
            "admin",
        ]
        const initialize = async () => {
            const auth = getAuth()
            const user = auth.currentUser
            const idToken = await user?.getIdTokenResult()

            const [
                offlinePersistenceType,
                hidden,
                titles,
                meta,
                breadcrumbs,
                formUpload,
                formImages,
                offlineCreateDisabled,
                offlineUpdateDisabled,
                offlineDeleteDisabled,
                enableDuplicate,
                disableCreate,
                convert,
                customFields,
                formButtons,
                formLists,
            ] = await Promise.all([
                getCachedConfigValue(
                    globalConfig,
                    ["global", "auth", "offlinePersistenceType"],
                    [user, idToken?.claims],
                ),
                tryPromise(customization.admin?.hidden),
                getCachedConfigValue(customization, [...collectionAdminPath, "titles"]),
                getCachedConfigValue(customization, [...collectionAdminPath, "meta"]),
                getCachedConfigValue(customization, [...collectionAdminPath, "breadcrumbs"]),
                getCachedConfigValue(customization, [...collectionAdminPath, "formUpload"]),
                getCachedConfigValue(customization, [...collectionAdminPath, "formImages"]),
                getCachedConfigValue(customization, [
                    "collections",
                    labels.collection,
                    "custom",
                    "disableOfflineCreate",
                ]),
                getCachedConfigValue(customization, [
                    "collections",
                    labels.collection,
                    "custom",
                    "disableOfflineUpdate",
                ]),
                getCachedConfigValue(customization, [
                    "collections",
                    labels.collection,
                    "custom",
                    "disableOfflineDelete",
                ]),
                getCachedConfigValue(customization, [...collectionAdminPath, "duplicate"]),
                getCachedConfigValue(customization, [...collectionAdminPath, "hideCreate"], [], true),
                getCachedConfigValue(customization, [...collectionAdminPath, "convert"]),
                getCachedConfigValue(customization, [...collectionAdminPath, "customFields"]),
                getCachedConfigValue(customization, [...collectionAdminPath, "formButtons"]),
                getCachedConfigValue(customization, [...collectionAdminPath, "formLists"]),
            ])

            setOfflinePersistenceType(offlinePersistenceType)
            setHidden(!!hidden)
            setCollectionTitle(titles?.collection || labels.collection)
            setRecordTitle(titles?.record || labels.record)
            setMeta(meta)
            setBreadcrumbs(breadcrumbs)
            setFormUploadEnabled(!!formUpload)
            setFormImagesEnabled(!!formImages)
            setIsOfflineCreateDisabled(offlineCreateDisabled)
            setIsOfflineUpdateDisabled(offlineUpdateDisabled)
            setIsOfflineDeleteDisabled(offlineDeleteDisabled)
            setEnableDuplicate(enableDuplicate)
            setDisableCreate(!!disableCreate)
            setConvert(convert)
            setCustomFields(customFields)

            const formButtonsTyped = formButtons as FormButton[] | undefined
            if (formButtonsTyped && formButtonsTyped.length > 0) {
                formButtonsTyped.forEach((button: FormButton) => {
                    button.setIsLoading = (isLoading: boolean) => {
                        if (!record) return
                        if (isLoading) {
                            setGlobalLoading("+", record.id)
                        } else {
                            setGlobalLoading("-", record.id)
                        }
                    }
                })
            }
            setFormButtons(formButtonsTyped)
            setFormLists(formLists)

            const collectionTitlePromises = Object.values(schema.collections).map(async (collection) => {
                const collectionCustomization = getCollectionConfigModule(collection.labels.collection)
                const collectionTitles = await getCachedConfigValue(collectionCustomization, [
                    "collections",
                    collection.labels.collection,
                    "admin",
                    "titles",
                ])
                return { collection, titles: collectionTitles }
            })

            const collectionTitleResults = await Promise.all(collectionTitlePromises)
            collectionTitleResults.forEach(({ collection, titles: collectionTitles }) => {
                setAllTitles((prev) => ({
                    ...prev,
                    [collection.labels.collection]: collectionTitles?.collection || collection.labels.collection,
                }))
                setAllRecordTitles((prev) => ({
                    ...prev,
                    [collection.labels.collection]: collectionTitles?.record || collection.labels.record,
                }))
                if (convert && convert.length > 0) {
                    setConvertAllowed((prev) => ({
                        ...prev,
                        [collection.labels.collection]: !disableCreate,
                    }))
                }
            })

            if (operation === "create" && offlinePersistenceType && ["ALL", "WRITE"].includes(offlinePersistenceType)) {
                const draft = localStorage.getItem(`stoker-draft-${labels.collection}`)
                if (draft) {
                    const parsedDraft = JSON.parse(draft)
                    if (parsedDraft && Object.keys(parsedDraft).length > 0) {
                        setDraftData(parsedDraft)
                        setShowDraftDialog(true)
                    }
                }
            }
            setIsInitialized(true)
            if (!onFormOpenCalledRef.current && operation === "create" && customization.admin?.onFormOpen) {
                record ||= {} as StokerRecord
                const recordClone = cloneDeep(record)
                await customization.admin?.onFormOpen("create", record)
                const recordKeys = Object.keys(record) as Array<keyof typeof record>
                for (const key of recordKeys) {
                    // eslint-disable-next-line security/detect-object-injection
                    if (!recordClone[key]) {
                        // eslint-disable-next-line security/detect-object-injection
                        form.setValue(key as string, record[key], { shouldDirty: false })
                    }
                }
                onFormOpenCalledRef.current = true
            }
        }
        initialize()
        return () => unsubscribe.current?.()
    }, [])

    useEffect(() => {
        const loadImages = async () => {
            if (!formImagesEnabled || operation !== "update" || !record || isOffline) return
            try {
                const items = await getFiles("", record)
                const imageItems = items.filter((item) => {
                    return !item.isFolder && /\.(png|jpe?g|gif|webp|svg)$/i.test(item.name)
                })
                const urls = await Promise.all(
                    imageItems.map(async (item) => {
                        const url = await getDownloadURL(ref(storage, item.fullPath))
                        return url
                    }),
                )
                setCarouselImages(urls)
            } finally {
                setCarouselLoading(false)
            }
        }
        loadImages()
    }, [formImagesEnabled, record?.id, isOffline])

    const scrollCarousel = useCallback((direction: "left" | "right") => {
        const el = carouselRef.current
        if (!el) return
        const scrollAmount = el.clientWidth * 0.8
        el.scrollBy({ left: direction === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" })
    }, [])

    const suppressDraftSaveRef = useRef(false)

    useEffect(() => {
        if (!(suppressDraftSaveRef?.current || !isDirty)) {
            if (
                isInitialized &&
                operation === "create" &&
                offlinePersistenceType &&
                ["ALL", "WRITE"].includes(offlinePersistenceType)
            ) {
                const currentTabId = getTabId()
                const existingDraft = localStorage.getItem(`stoker-draft-${labels.collection}`)
                const draftOwner = localStorage.getItem(`stoker-draft-owner-${labels.collection}`)

                if (!existingDraft || draftOwner === currentTabId) {
                    const valuesClone = cloneDeep(formValues)
                    serializeTimestamps(valuesClone)
                    if (collection.auth) {
                        delete valuesClone.User_ID
                        delete valuesClone.password
                        delete valuesClone.passwordConfirm
                    }
                    localStorage.setItem(`stoker-draft-${labels.collection}`, JSON.stringify(valuesClone))
                    localStorage.setItem(`stoker-draft-owner-${labels.collection}`, currentTabId)
                }
            }
        }

        if (isInitialized && (operation === "create" || operation === "update") && customization.admin?.onChange) {
            tryPromise(customization.admin.onChange, [
                operation,
                cloneDeep(formValues) as StokerRecord,
                prevState as StokerRecord,
            ]).then((updatedRecord: StokerRecord) => {
                if (updatedRecord && !isEqual(updatedRecord, formValues)) {
                    Object.entries(updatedRecord).forEach(([key, value]) => {
                        form.setValue(key, value)
                    })
                }
            })
        }
    }, [form.watch()])

    const recordLoaded = useRef(false)

    useEffect(() => {
        ;(async () => {
            if (operation !== "update" || isLoading?.current) return
            if (!record) {
                form.reset({})
                return
            }
            for (const field of fields) {
                if (field.type === "Embedding") continue
                const liveUpdate = await getCachedConfigValue(customization, [
                    "collections",
                    labels.collection,
                    "admin",
                    "live",
                ])
                const fieldCustomization = getFieldCustomization(field, customization)
                const admin = fieldCustomization.admin
                const fieldLiveUpdate = await tryPromise(admin?.live)
                if (
                    liveUpdate ||
                    fieldLiveUpdate ||
                    (!recordLoaded.current && !(auth && field.name === "User_ID")) ||
                    (softDelete && field.name === softDelete?.archivedField) ||
                    (field.type === "Number" && field.autoIncrement)
                ) {
                    if (record[field.name] === undefined) continue
                    form.setValue(field.name, record[field.name])
                    if (recordLoaded.current) {
                        setPrevState((prev) => ({
                            ...prev,
                            [field.name]: record?.[field.name],
                        }))
                        setOriginalRecord((prev) => {
                            if (!prev) return record
                            return {
                                ...prev,
                                [field.name]: record?.[field.name],
                            }
                        })
                    }
                }
            }
            recordLoaded.current = true
        })()
    }, [record])

    useEffect(() => {
        if (isInitialized) {
            const valuesClone = cloneDeep(formValues)
            const prevStateClone = cloneDeep(prevState)
            Object.keys(valuesClone || {}).forEach((key) => {
                if (
                    key.startsWith("operations-") ||
                    key.startsWith("restrict-") ||
                    key.startsWith("auth-") ||
                    key.startsWith("accessible-") ||
                    key.startsWith("attribute-")
                ) {
                    // eslint-disable-next-line security/detect-object-injection
                    delete valuesClone[key]
                }
            })
            delete valuesClone.User_ID
            Object.keys(prevStateClone || {}).forEach((key) => {
                if (
                    key.startsWith("operations-") ||
                    key.startsWith("restrict-") ||
                    key.startsWith("auth-") ||
                    key.startsWith("accessible-") ||
                    key.startsWith("attribute-")
                ) {
                    // eslint-disable-next-line security/detect-object-injection
                    delete prevStateClone[key]
                }
            })
            fields.forEach((field) => {
                if (field.type === "Map" && valuesClone[field.name] instanceof Delta && valuesClone[field.name].ops) {
                    if (
                        isEqual(valuesClone[field.name].ops, prevStateClone[field.name]?.ops) ||
                        (valuesClone[field.name].ops.length === 1 &&
                            valuesClone[field.name].ops[0].insert === "\n" &&
                            !prevStateClone[field.name]?.ops)
                    ) {
                        prevStateClone[field.name] = valuesClone[field.name]
                    }
                }
                if (isRelationField(field)) {
                    if (valuesClone[field.name]) {
                        valuesClone[field.name] = Object.keys(valuesClone[field.name])
                    }
                    if (prevStateClone[field.name]) {
                        prevStateClone[field.name] = Object.keys(prevStateClone[field.name])
                    }
                }
                if (field.type === "Computed") {
                    delete valuesClone[field.name]
                    delete prevStateClone[field.name]
                }
            })
            delete prevStateClone.User_ID
            removeEmptyStrings(collection, valuesClone)
            removeEmptyStrings(collection, prevStateClone)
            systemFields.forEach((field) => {
                // eslint-disable-next-line security/detect-object-injection
                delete valuesClone[field]
                // eslint-disable-next-line security/detect-object-injection
                delete prevStateClone[field]
            })
            const dirtyState =
                !isEqual(prevStateClone, valuesClone) &&
                !(Object.keys(valuesClone || {}).length === 0 && Object.keys(prevStateClone || {}).length === 0)
            setIsDirty(dirtyState)
            if (operation === "update") {
                setIsDuplicate(false)
            }
        }
    }, [form, formValues, prevState])

    const handleSubmit = useCallback(
        async (values: z.infer<typeof formSchema>) => {
            for (const field of fields) {
                const fieldCustomization = getFieldCustomization(field, customization)
                const label = tryFunction(fieldCustomization.admin?.label) || field.name
                const overrideFormRequiredValidation = tryFunction(
                    fieldCustomization.admin?.overrideFormRequiredValidation,
                    [operation, values],
                )
                let hasValue = false
                switch (field.type) {
                    case "Map":
                        hasValue =
                            values[field.name] &&
                            !(values[field.name].ops.length === 1 && values[field.name].ops[0].insert === "\n")
                        break
                    default:
                        hasValue = !!values[field.name]
                }
                if (overrideFormRequiredValidation && !hasValue) {
                    setError(`"${label}" is required`)
                    return
                }

                if (operation === "create" && tryFunction(fieldCustomization.admin?.image)) {
                    delete values[field.name]
                }

                if (field.access && permissions?.Role && !field.access.includes(permissions.Role)) {
                    delete values[field.name]
                }
                if (
                    operation === "create" &&
                    field.restrictCreate &&
                    (field.restrictCreate === true ||
                        (permissions?.Role && !field.restrictCreate.includes(permissions.Role)))
                ) {
                    delete values[field.name]
                }
                if (
                    operation === "update" &&
                    field.restrictUpdate &&
                    (field.restrictUpdate === true ||
                        (permissions?.Role && !field.restrictUpdate.includes(permissions.Role)))
                ) {
                    delete values[field.name]
                }
            }

            let userData: UserData | undefined
            if (values.operation) {
                userData = {
                    operation: values.operation,
                    password: values.password,
                    passwordConfirm: values.passwordConfirm,
                    permissions: {
                        Role: record?.Role || originalRecord?.Role,
                        collections: {},
                    },
                }

                const role = record?.Role || values.Role

                for (const permissionsCollection of Object.values(schema.collections)) {
                    if (!userData.permissions?.collections) continue

                    const permissionWriteRestriction = access.permissionWriteRestrictions?.find(
                        (restriction) =>
                            restriction.userRole === permissions.Role && restriction.recordRole.includes(role),
                    )
                    const collectionPermissionWriteRestrictions = permissionWriteRestriction?.collections.find(
                        (collection) => collection.collection === permissionsCollection.labels.collection,
                    )
                    if (permissionWriteRestriction && !collectionPermissionWriteRestrictions) {
                        delete values[`operations-${permissionsCollection.labels.collection}`]
                        continue
                    }

                    if (
                        !collectionAccess(
                            "Read",
                            permissions.collections?.[permissionsCollection.labels.collection] as CollectionPermissions,
                        )
                    ) {
                        continue
                    }

                    userData.permissions.collections[permissionsCollection.labels.collection] = {
                        operations: [],
                    }
                    if (values[`auth-${permissionsCollection.labels.collection}`]) {
                        userData.permissions.collections[permissionsCollection.labels.collection].auth = true
                    }
                    delete values[`auth-${permissionsCollection.labels.collection}`]
                    if (values[`operations-${permissionsCollection.labels.collection}`]) {
                        userData.permissions.collections[permissionsCollection.labels.collection].operations =
                            values[`operations-${permissionsCollection.labels.collection}`]
                    }
                    delete values[`operations-${permissionsCollection.labels.collection}`]
                    if (
                        values[`restrict-${permissionsCollection.labels.collection}`] === true ||
                        (permissionsCollection.access.entityRestrictions?.restrictions?.some((restriction) =>
                            restriction.roles.some((restrictionRole) => restrictionRole.role === role),
                        ) &&
                            !permissionsCollection.access.entityRestrictions?.assignable?.some(
                                (restrictionRole) => restrictionRole === role,
                            )) ||
                        collectionPermissionWriteRestrictions?.restrictEntities
                    ) {
                        userData.permissions.collections[permissionsCollection.labels.collection].restrictEntities =
                            true
                    }
                    delete values[`restrict-${permissionsCollection.labels.collection}`]
                    permissionsCollection.access.attributeRestrictions?.forEach((restriction) => {
                        if (!userData?.permissions?.collections) return
                        const roleConfig = restriction.roles.find((restrictionRole) => restrictionRole.role === role)
                        if (roleConfig) {
                            if (
                                values[`attribute-${permissionsCollection.labels.collection}-${restriction.type}`] ===
                                    true ||
                                !roleConfig.assignable ||
                                collectionPermissionWriteRestrictions?.attributeRestrictions?.includes(restriction.type)
                            ) {
                                if (restriction.type === "Record_Owner") {
                                    userData.permissions.collections[
                                        permissionsCollection.labels.collection
                                    ].recordOwner = { active: true }
                                } else if (restriction.type === "Record_User") {
                                    userData.permissions.collections[
                                        permissionsCollection.labels.collection
                                    ].recordUser = { active: true }
                                } else if (restriction.type === "Record_Property") {
                                    userData.permissions.collections[
                                        permissionsCollection.labels.collection
                                    ].recordProperty = { active: true }
                                }
                            }
                        }
                        delete values[`attribute-${permissionsCollection.labels.collection}-${restriction.type}`]
                    })
                    permissionsCollection.access.entityRestrictions?.restrictions?.forEach((restriction) => {
                        if (!userData?.permissions?.collections) return
                        if (restriction.roles.some((restrictionRole) => restrictionRole.role === role)) {
                            if (restriction.type === "Individual") {
                                const accessibleKey = `accessible-${permissionsCollection.labels.collection}-${permissionsCollection.labels.collection}`
                                // eslint-disable-next-line security/detect-object-injection
                                const accessibleValue = values[accessibleKey] as string[] | undefined
                                if (accessibleValue) {
                                    userData.permissions.collections[
                                        permissionsCollection.labels.collection
                                    ].individualEntities = Object.keys(accessibleValue)
                                    // eslint-disable-next-line security/detect-object-injection
                                    delete values[accessibleKey]
                                } else {
                                    userData.permissions.collections[
                                        permissionsCollection.labels.collection
                                    ].individualEntities = []
                                }
                            }
                            if (restriction.type === "Parent") {
                                const collectionField = getField(
                                    permissionsCollection.fields,
                                    restriction.collectionField,
                                ) as RelationFieldType
                                const accessibleKey = `accessible-${permissionsCollection.labels.collection}-${collectionField.collection}`
                                // eslint-disable-next-line security/detect-object-injection
                                const accessibleValue = values[accessibleKey] as string[] | undefined
                                if (accessibleValue) {
                                    userData.permissions.collections[
                                        permissionsCollection.labels.collection
                                    ].parentEntities = Object.keys(accessibleValue)
                                    // eslint-disable-next-line security/detect-object-injection
                                    delete values[accessibleKey]
                                } else {
                                    userData.permissions.collections[
                                        permissionsCollection.labels.collection
                                    ].parentEntities = []
                                }
                            }
                            if (restriction.type === "Parent_Property") {
                                const collectionField = getField(
                                    permissionsCollection.fields,
                                    restriction.collectionField,
                                ) as RelationFieldType
                                const accessibleKey = `accessible-${permissionsCollection.labels.collection}-${collectionField.collection}`
                                // eslint-disable-next-line security/detect-object-injection
                                const accessibleValue = values[accessibleKey] as Record<string, string[]> | undefined
                                if (accessibleValue) {
                                    userData.permissions.collections[
                                        permissionsCollection.labels.collection
                                    ].parentPropertyEntities = accessibleValue
                                    // eslint-disable-next-line security/detect-object-injection
                                    delete values[accessibleKey]
                                } else {
                                    userData.permissions.collections[
                                        permissionsCollection.labels.collection
                                    ].parentPropertyEntities = {}
                                }
                            }
                        }
                    })
                }
            } else {
                Object.keys(values).forEach((key) => {
                    if (
                        key.startsWith("operations-") ||
                        key.startsWith("restrict-") ||
                        key.startsWith("auth-") ||
                        key.startsWith("accessible-") ||
                        key.startsWith("attribute-")
                    ) {
                        // eslint-disable-next-line security/detect-object-injection
                        delete values[key]
                    }
                })
            }
            if (values.operation === "delete" && userData?.permissions) {
                delete userData.permissions
            }
            delete values.operation
            delete values.password
            delete values.passwordConfirm

            const offlineDisabled = await isOfflineDisabledSync(
                operation === "update-many" ? "update" : operation,
                collection,
                values,
                userData,
            )
            if (offlineDisabled) {
                alert(`You are offline and cannot ${operation} this record.`)
                return
            }

            const recordToSave = cloneDeep(values) as Partial<StokerRecord>
            const prevStateToSave = cloneDeep(prevState)
            for (const key in recordToSave) {
                if (!Object.prototype.hasOwnProperty.call(recordToSave, key)) {
                    continue
                }
                // eslint-disable-next-line security/detect-object-injection
                if (isEqual(recordToSave[key], prevStateToSave?.[key])) {
                    // eslint-disable-next-line security/detect-object-injection
                    delete recordToSave[key]
                }
            }

            if (operation === "create") {
                const serverWrite = isServerCreate(collection, userData)
                const docId = doc(dbCollection(db, "tenants", tenantId, labels.collection)).id

                setGlobalLoading("+", docId, serverWrite, !(serverWrite || isServerReadOnly))
                if (isServerReadOnly) {
                    setIsAddingServer(true)
                }

                const onValid = () => {
                    if (!isServerReadOnly) {
                        if (onSuccess) onSuccess()
                    }
                }

                addRecord(
                    path,
                    recordToSave,
                    userData as UserData & { password: string; passwordConfirm: string },
                    undefined,
                    docId,
                    onValid,
                )
                    .then(() => {
                        if (serverWrite || isServerReadOnly) {
                            toast({
                                // eslint-disable-next-line security/detect-object-injection
                                description: `${recordTitle} ${recordTitleField ? values[recordTitleField] : id} created successfully.`,
                            })
                            suppressDraftSaveRef.current = true
                            localStorage.removeItem(`stoker-draft-${labels.collection}`)
                            localStorage.removeItem(`stoker-draft-owner-${labels.collection}`)
                        }
                        if (userData) {
                            form.setValue("operation", undefined, { shouldDirty: false })
                            form.setValue("password", "", { shouldDirty: false })
                            form.setValue("passwordConfirm", "", { shouldDirty: false })
                        }

                        if (isServerReadOnly) {
                            setIsAddingServer(false)
                            if (onSuccess) onSuccess()
                        }
                    })
                    .then(async () => {
                        if (queuedUploads.length > 0) {
                            for (const upload of queuedUploads) {
                                await uploadFilesToRecord(
                                    docId,
                                    upload.files,
                                    upload.permissions,
                                    upload.customFilename,
                                )
                            }
                            setQueuedUploads([])
                        }
                        const basePath = computeBasePath(docId)
                        for (const [fieldName, imageInfo] of Object.entries(queuedImageUploads)) {
                            const { file, permissions: imagePermissions } = imageInfo
                            const filename = file.name
                            await uploadFilesToRecord(docId, [file], imagePermissions, filename)
                            const filePath = `${basePath}/${filename}`
                            const storageRef = ref(storage, filePath)
                            const url = await getDownloadURL(storageRef)
                            await updateRecord(path, docId, { [fieldName]: url }, undefined, undefined, originalRecord)
                        }
                        setQueuedImageUploads({})
                    })
                    .then(() => {
                        setError(null)
                    })
                    .catch((error) => {
                        console.error(error)
                        if (error.message.includes("VALIDATION_ERROR")) {
                            toast({
                                description: error.message.replace("VALIDATION_ERROR: ", ""),
                                variant: "destructive",
                                duration: 10000000,
                            })
                        } else {
                            toast({
                                // eslint-disable-next-line security/detect-object-injection
                                description: `${recordTitle} ${recordTitleField ? values[recordTitleField] || "" : id} failed to create.`,
                                variant: "destructive",
                            })
                        }
                    })
                    .finally(() => {
                        setGlobalLoading("-", docId, undefined, !(serverWrite || isServerReadOnly))
                    })
                if (!(serverWrite || isServerReadOnly)) {
                    toast({
                        // eslint-disable-next-line security/detect-object-injection
                        description: `${recordTitle} ${recordTitleField ? values[recordTitleField] || "" : id} created.`,
                    })
                    suppressDraftSaveRef.current = true
                    localStorage.removeItem(`stoker-draft-${labels.collection}`)
                    localStorage.removeItem(`stoker-draft-owner-${labels.collection}`)
                }
            } else if (operation === "update") {
                if (!id) {
                    setError("No ID provided for update operation")
                    return
                }
                const serverWrite = isServerUpdate(collection, { ...recordToSave, id }, userData)
                const optimisticUpdate = { ...originalRecord, ...cloneDeep(recordToSave) } as StokerRecord
                setOptimisticUpdate(labels.collection, optimisticUpdate)

                setGlobalLoading("+", id, serverWrite, !(serverWrite || isServerReadOnly))
                setIsSaving(true)

                for (const field of fields) {
                    if (isRelationField(field)) {
                        const originalValue = cloneDeep(originalRecord?.[field.name])
                        const newValue = cloneDeep(recordToSave[field.name])
                        if (isEqual(Object.keys(originalValue || {}), Object.keys(newValue || {}))) {
                            delete recordToSave[field.name]
                        }
                    }
                }

                const finalRecord = { ...originalRecord, ...cloneDeep(recordToSave) } as StokerRecord

                updateRecord(
                    path,
                    id,
                    recordToSave,
                    userData as UserData & { operation: "create" | "update" | "delete" },
                    undefined,
                    originalRecord,
                )
                    .then(async () => {
                        if (serverWrite || isServerReadOnly) {
                            toast({
                                // eslint-disable-next-line security/detect-object-injection
                                description: `${recordTitle} ${recordTitleField ? finalRecord[recordTitleField] : id} updated successfully.`,
                            })
                        }
                        await getOriginalRecord()
                        setFormSavedKey((prev) => prev + 1)
                        setError(null)
                        if (userData) {
                            form.setValue("operation", undefined, { shouldDirty: false })
                            form.setValue("password", "", { shouldDirty: false })
                            form.setValue("passwordConfirm", "", { shouldDirty: false })
                        }
                    })
                    .catch((error) => {
                        console.error(error)
                        setError(error.message.replace("VALIDATION_ERROR: ", ""))
                    })
                    .finally(() => {
                        removeOptimisticUpdate(labels.collection, id)
                        // Prevent disabled button UI flicker
                        setTimeout(() => {
                            setGlobalLoading("-", id, undefined, !(serverWrite || isServerReadOnly))
                            setIsSaving(false)
                        }, 0)
                    })
                if (!serverWrite && !isServerReadOnly) {
                    removeCacheOptimistic(collection, finalRecord)
                    toast({
                        // eslint-disable-next-line security/detect-object-injection
                        description: `${recordTitle} ${recordTitleField ? finalRecord[recordTitleField] : id} updated.`,
                    })
                }
            } else if (operation === "update-many") {
                if (!rowSelection || rowSelection.length === 0) {
                    setError("No records selected for update operation")
                    return
                }

                const updatePromises: Promise<StokerRecord>[] = []

                rowSelection.forEach((selectedRecord) => {
                    if (selectedRecord.id) {
                        setOptimisticUpdate(labels.collection, {
                            ...selectedRecord,
                            ...cloneDeep(recordToSave),
                        } as StokerRecord)
                    }
                })

                rowSelection.forEach((selectedRecord) => {
                    if (!selectedRecord.id) return

                    const serverWrite = isServerUpdate(collection, { ...recordToSave, id: selectedRecord.id })
                    setGlobalLoading("+", selectedRecord.id, serverWrite, !(serverWrite || isServerReadOnly))

                    const updatePromise = updateRecord(
                        path,
                        selectedRecord.id,
                        recordToSave,
                        undefined,
                        undefined,
                        selectedRecord,
                    )
                        .catch((error) => {
                            console.error(`Failed to update record ${selectedRecord.id}:`, error)
                            toast({
                                // eslint-disable-next-line security/detect-object-injection
                                description: `${recordTitle} ${recordTitleField ? selectedRecord[recordTitleField] : selectedRecord.id} failed to update.`,
                                variant: "destructive",
                            })
                        })
                        .finally(() => {
                            removeOptimisticUpdate(labels.collection, selectedRecord.id)
                            setGlobalLoading("-", selectedRecord.id, undefined, !(serverWrite || isServerReadOnly))
                            if (serverWrite || isServerReadOnly) {
                                if (onSaveRecord) onSaveRecord()
                            }
                        })

                    updatePromises.push(updatePromise as Promise<StokerRecord>)
                })

                if (isServerReadOnly) {
                    await Promise.all(updatePromises)
                } else {
                    Promise.all(updatePromises)
                }

                rowSelection.forEach((selectedRecord) => {
                    const serverWrite = isServerUpdate(collection, { ...recordToSave, id: selectedRecord.id })
                    if (!serverWrite && !isServerReadOnly) {
                        if (selectedRecord.id) {
                            removeCacheOptimistic(collection, {
                                ...selectedRecord,
                                ...cloneDeep(recordToSave),
                            } as StokerRecord)
                        }
                    }
                })

                toast({
                    description: `${rowSelection.length} ${recordTitle} records updated.`,
                })

                if (onSuccess) onSuccess()
            }
        },
        [form, formValues, prevState, originalRecord, id, isServerReadOnly, rowSelection],
    )

    const handleDelete = useCallback(async () => {
        if (!formValues) return
        const offlineDisabled = await isOfflineDisabledSync(
            operation === "update-many" ? "update" : operation,
            collection,
            formValues,
        )
        if (offlineDisabled) {
            alert(`You are offline and cannot ${operation} this record.`)
            return
        }

        if (!id) {
            setError("No ID provided for delete operation")
            return
        }
        const serverWrite = isServerDelete(collection, formValues as StokerRecord)

        setOptimisticDelete(labels.collection, id)

        setGlobalLoading("+", id, serverWrite, !(serverWrite || isServerReadOnly))

        deleteRecord(path, id)
            .then(() => {
                if (serverWrite || isServerReadOnly) {
                    toast({
                        // eslint-disable-next-line security/detect-object-injection
                        description: `${recordTitle} ${recordTitleField ? originalRecord?.[recordTitleField] : id} deleted successfully.`,
                    })
                }
            })
            .catch((error) => {
                if (error.message.includes("VALIDATION_ERROR")) {
                    toast({
                        description: error.message.replace("VALIDATION_ERROR: ", ""),
                        variant: "destructive",
                        duration: 10000000,
                    })
                } else {
                    toast({
                        // eslint-disable-next-line security/detect-object-injection
                        description: `${recordTitle} ${recordTitleField ? originalRecord?.[recordTitleField] : id} failed to delete.`,
                        variant: "destructive",
                    })
                }
            })
            .finally(() => {
                if (serverWrite || isServerReadOnly) {
                    removeOptimisticDelete(labels.collection, id)
                }
                setGlobalLoading("-", id, undefined, !(serverWrite || isServerReadOnly))
            })
        if (!serverWrite && !isServerReadOnly) {
            removeOptimisticDelete(labels.collection, id)
            toast({
                // eslint-disable-next-line security/detect-object-injection
                description: `${recordTitle} ${recordTitleField ? originalRecord?.[recordTitleField] : id} deleted.`,
            })
        }
        if (!(hidden && !fromRelationList)) {
            navigate(fromRelationList ? fromRelationList : `/${labels.collection?.toLowerCase()}`)
        }
    }, [formValues, originalRecord, navigate, hidden])

    const handleRestore = useCallback(async () => {
        if (!formValues) return
        const offlineDisabled = await isOfflineDisabledSync(
            operation === "update-many" ? "update" : operation,
            collection,
            formValues,
        )
        if (offlineDisabled) {
            alert(`You are offline and cannot ${operation} this record.`)
            return
        }

        if (!id) {
            setError("No ID provided for delete operation")
            return
        }
        const serverWrite = isServerDelete(collection, formValues as StokerRecord)

        setGlobalLoading("+", id, serverWrite, !(serverWrite || isServerReadOnly))

        if (softDeleteField && softDeleteTimestampField) {
            updateRecord(path, id, { [softDeleteField]: false, [softDeleteTimestampField]: deleteField() })
                .then(() => {
                    if (serverWrite || isServerReadOnly) {
                        toast({
                            // eslint-disable-next-line security/detect-object-injection
                            description: `${recordTitle} ${recordTitleField ? originalRecord?.[recordTitleField] : id} restored successfully.`,
                        })
                    }
                    if (isServerReadOnly) {
                        runViewTransition(() => navigate(`/${labels.collection.toLowerCase()}`))
                    }
                })
                .catch(() => {
                    toast({
                        // eslint-disable-next-line security/detect-object-injection
                        description: `${recordTitle} ${recordTitleField ? originalRecord?.[recordTitleField] : id} failed to restore.`,
                        variant: "destructive",
                    })
                })
                .finally(() => {
                    setGlobalLoading("-", id, undefined, !(serverWrite || isServerReadOnly))
                })
        }
        if (!(serverWrite || isServerReadOnly)) {
            toast({
                // eslint-disable-next-line security/detect-object-injection
                description: `${recordTitle} ${recordTitleField ? originalRecord?.[recordTitleField] : id} restored.`,
            })
        }
        if (!isServerReadOnly) {
            if (!(hidden && !fromRelationList)) {
                navigate(fromRelationList ? fromRelationList : `/${labels.collection?.toLowerCase()}`)
            }
        }
    }, [formValues, originalRecord, navigate, hidden])

    const revert = useCallback(() => {
        resetPermissions()
        form.reset(prevState)
        setFormResetKey((prev) => prev + 1)
    }, [form, prevState])

    const duplicateRecord = useCallback(async () => {
        if (!formValues) return
        const record = cloneDeep(originalRecord) as Partial<StokerRecord>
        const globalConfig = getGlobalConfigModule()
        await runHooks("preDuplicate", globalConfig, customization, [record])
        const recordToDuplicate: Partial<StokerRecord> = {}
        for (const field of fields) {
            const fieldCustomization = getFieldCustomization(field, customization)
            if (
                field.type !== "Computed" &&
                !(field.type === "Number" && field.autoIncrement) &&
                !(collection.auth && field.name === "User_ID") &&
                restrictCreateAccess(field, permissions) &&
                fieldCustomization.custom?.initialValue === undefined
            ) {
                recordToDuplicate[field.name] = record[field.name]
            }
        }
        setDuplicateRecordData(recordToDuplicate)
        setIsDuplicate(true)
        setShowDuplicateModal(true)
    }, [formValues])

    const convertRecord = useCallback(
        async (targetCollection: CollectionSchema) => {
            if (!formValues || !originalRecord) return
            const record = cloneDeep(originalRecord) as Partial<StokerRecord>

            const convertConfig = convert?.find((convert) => convert.collection === targetCollection.labels.collection)
            if (!convertConfig) return

            const convertedRecord = await convertConfig.convert(record as StokerRecord)

            setConvertRecordData(convertedRecord)
            setConvertTargetCollection(targetCollection)
            setShowConvertModal(true)
        },
        [formValues, originalRecord, permissions],
    )

    const hasBreadcrumbs = useMemo(() => {
        return !!breadcrumbs?.filter((breadcrumb) => {
            const field = getField(fields, breadcrumb) as RelationFieldType
            return field && record?.[`${field.name}_Array`]?.length
        })?.length
    }, [breadcrumbs, record])

    if (!formValues) return null

    return (
        <>
            <Helmet>
                <title>{`${meta?.title || collectionTitle || labels.collection} - Edit`}</title>
                {meta?.description && <meta name="description" content={meta.description} />}
            </Helmet>
            {operation === "update" && record && hasBreadcrumbs && (
                <>
                    <Breadcrumbs breadcrumbs={breadcrumbs} collection={collection} record={record} />
                    <Separator className="mt-5 mb-3" />
                </>
            )}
            <Form {...form}>
                <form className="space-y-8 max-w-[750px]">
                    {formImagesEnabled && operation === "update" && !isOffline && (
                        <div className="flex flex-col gap-3 mt-2">
                            <Label>Images</Label>
                            {carouselLoading ? (
                                <div className="flex justify-center py-6">
                                    <LoadingSpinner size={7} />
                                </div>
                            ) : carouselImages.length > 0 ? (
                                <div className="relative">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => scrollCarousel("left")}
                                            className="shrink-0"
                                        >
                                            <ChevronLeftIcon className="w-4 h-4" />
                                        </Button>
                                        <div
                                            ref={carouselRef}
                                            className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth w-full"
                                        >
                                            {carouselImages.map((src, idx) => (
                                                <div key={idx} className="border rounded p-2 shrink-0">
                                                    <img
                                                        src={src}
                                                        alt=""
                                                        className="h-40 w-40 object-contain rounded"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => scrollCarousel("right")}
                                            className="shrink-0"
                                        >
                                            <ChevronRightIcon className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground">No images found</div>
                            )}
                        </div>
                    )}

                    {renderFieldsWithCustomFields()}

                    {operation !== "update-many" &&
                        isFormReady >= fields.length &&
                        auth &&
                        collectionPermissions.auth &&
                        !isUpdateDisabled &&
                        showPermissions && (
                            <>
                                <FormField
                                    control={form.control}
                                    name="password"
                                    disabled={isDisabled}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormDescription className="pb-2">
                                                {originalRecord?.User_ID
                                                    ? `Enter a password below to change the password for this ${labels.record}`
                                                    : `Add system access for this ${labels.record} by entering a password below`}
                                            </FormDescription>
                                            <FormLabel className="text-primary">
                                                {record?.User_ID ? "New Password" : "Password"}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="password"
                                                    autoComplete="new-password"
                                                    {...field}
                                                    onBlur={(event) => {
                                                        if (event.target.value) {
                                                            if (record?.User_ID) {
                                                                form.setValue("operation", "update")
                                                            } else {
                                                                form.setValue("operation", "create")
                                                            }
                                                        }
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="passwordConfirm"
                                    disabled={isDisabled}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-primary">Confirm Password</FormLabel>
                                            <FormControl>
                                                <Input type="password" autoComplete="new-password" {...field} />
                                            </FormControl>
                                            <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                                        </FormItem>
                                    )}
                                />
                                {(form.getValues("operation") || record?.User_ID) &&
                                    (operation === "update" || formValues.Role) && (
                                        <>
                                            <div className="text-md font-semibold">Permissions</div>
                                            {Object.values(schema.collections).map((permissionsCollection) => {
                                                const operations = ["Read", "Create", "Update", "Delete"]

                                                if (
                                                    !collectionAccess(
                                                        "Read",
                                                        permissions.collections?.[
                                                            permissionsCollection.labels.collection
                                                        ] as CollectionPermissions,
                                                    )
                                                ) {
                                                    return null
                                                }

                                                const permissionWriteRestriction =
                                                    access.permissionWriteRestrictions?.find(
                                                        (restriction) =>
                                                            restriction.userRole === permissions.Role &&
                                                            restriction.recordRole.includes(role),
                                                    )
                                                const collectionPermissionWriteRestrictions =
                                                    permissionWriteRestriction?.collections.find(
                                                        (collection) =>
                                                            collection.collection ===
                                                            permissionsCollection.labels.collection,
                                                    )
                                                if (
                                                    permissionWriteRestriction &&
                                                    !collectionPermissionWriteRestrictions
                                                ) {
                                                    return null
                                                }

                                                const hasAttributeRestrictions =
                                                    permissionsCollection.access.attributeRestrictions?.some(
                                                        (restriction) =>
                                                            restriction.roles.some(
                                                                (restrictionRole) => restrictionRole.role === role,
                                                            ),
                                                    )

                                                const hasEntityRestrictions =
                                                    permissionsCollection.access.entityRestrictions?.restrictions?.some(
                                                        (restriction) =>
                                                            restriction.roles.some(
                                                                (restrictionRole) => restrictionRole.role === role,
                                                            ),
                                                    )

                                                if (
                                                    !isAssignable(permissionsCollection) &&
                                                    !hasEntityRestrictions &&
                                                    operations.every(
                                                        (operation) => !defaultAccess(permissionsCollection, operation),
                                                    )
                                                )
                                                    return null

                                                return (
                                                    <div
                                                        key={`permissions-${permissionsCollection.labels.collection}`}
                                                        className={
                                                            record?.User_ID || formValues.password ? "" : "hidden"
                                                        }
                                                    >
                                                        <FormLabel className="text-primary">
                                                            {allTitles[permissionsCollection.labels.collection]}
                                                        </FormLabel>
                                                        <div className="flex flex-row gap-3 mt-2">
                                                            {permissionsCollection.access.auth?.includes(role) &&
                                                                !(
                                                                    collectionPermissionWriteRestrictions &&
                                                                    !collectionPermissionWriteRestrictions.auth
                                                                ) && (
                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`auth-${permissionsCollection.labels.collection}`}
                                                                        disabled={isDisabled}
                                                                        defaultValue={false}
                                                                        render={({ field: formField }) => (
                                                                            <FormItem>
                                                                                <FormControl>
                                                                                    <div className="flex items-center gap-3 mt-2">
                                                                                        <Checkbox
                                                                                            checked={formField.value}
                                                                                            id={`auth-${permissionsCollection.labels.collection}`}
                                                                                            disabled={isDisabled}
                                                                                            onCheckedChange={(
                                                                                                checked,
                                                                                            ) => {
                                                                                                if (record?.User_ID) {
                                                                                                    form.setValue(
                                                                                                        "operation",
                                                                                                        "update",
                                                                                                    )
                                                                                                } else {
                                                                                                    form.setValue(
                                                                                                        "operation",
                                                                                                        "create",
                                                                                                    )
                                                                                                }
                                                                                                return checked
                                                                                                    ? formField.onChange(
                                                                                                          true,
                                                                                                      )
                                                                                                    : formField.onChange(
                                                                                                          false,
                                                                                                      )
                                                                                            }}
                                                                                        />
                                                                                        <Label>
                                                                                            Can create and modify access
                                                                                            permissions
                                                                                        </Label>
                                                                                    </div>
                                                                                </FormControl>
                                                                            </FormItem>
                                                                        )}
                                                                    />
                                                                )}
                                                        </div>
                                                        <div className="flex flex-row gap-3 mt-2">
                                                            {operations.map((operation) => {
                                                                if (
                                                                    !permissionsCollection.access.operations[
                                                                        operation.toLowerCase() as
                                                                            | "read"
                                                                            | "create"
                                                                            | "update"
                                                                            | "delete"
                                                                    ]?.includes(role)
                                                                ) {
                                                                    return null
                                                                }
                                                                if (
                                                                    collectionPermissionWriteRestrictions &&
                                                                    !collectionPermissionWriteRestrictions.operations.includes(
                                                                        operation as
                                                                            | "Read"
                                                                            | "Create"
                                                                            | "Update"
                                                                            | "Delete",
                                                                    )
                                                                ) {
                                                                    return null
                                                                }
                                                                return (
                                                                    <FormField
                                                                        key={`operations-${permissionsCollection.labels.collection}-${operation}`}
                                                                        control={form.control}
                                                                        name={`operations-${permissionsCollection.labels.collection}`}
                                                                        disabled={isDisabled}
                                                                        defaultValue={
                                                                            defaultPermissionsValues[
                                                                                permissionsCollection.labels.collection
                                                                            ]
                                                                        }
                                                                        render={({ field: formField }) => (
                                                                            <FormItem>
                                                                                <FormControl>
                                                                                    <div className="flex flex-row gap-3 mt-2">
                                                                                        <div className="flex items-center gap-3">
                                                                                            <Checkbox
                                                                                                checked={formField.value?.includes(
                                                                                                    operation,
                                                                                                )}
                                                                                                id={`operations-${permissionsCollection.labels.collection}-${operation}`}
                                                                                                disabled={
                                                                                                    isDisabled ||
                                                                                                    !isAssignable(
                                                                                                        permissionsCollection,
                                                                                                    )
                                                                                                }
                                                                                                onCheckedChange={(
                                                                                                    checked,
                                                                                                ) => {
                                                                                                    if (
                                                                                                        record?.User_ID
                                                                                                    ) {
                                                                                                        form.setValue(
                                                                                                            "operation",
                                                                                                            "update",
                                                                                                        )
                                                                                                    } else {
                                                                                                        form.setValue(
                                                                                                            "operation",
                                                                                                            "create",
                                                                                                        )
                                                                                                    }
                                                                                                    return checked
                                                                                                        ? formField.onChange(
                                                                                                              [
                                                                                                                  ...formField.value,
                                                                                                                  operation,
                                                                                                              ],
                                                                                                          )
                                                                                                        : formField.onChange(
                                                                                                              formField.value?.filter(
                                                                                                                  (
                                                                                                                      value: string,
                                                                                                                  ) =>
                                                                                                                      value !==
                                                                                                                      operation,
                                                                                                              ),
                                                                                                          )
                                                                                                }}
                                                                                            />
                                                                                            <Label
                                                                                                htmlFor={`operations-${permissionsCollection.labels.collection}-${operation}`}
                                                                                            >
                                                                                                {operation}
                                                                                            </Label>
                                                                                        </div>
                                                                                    </div>
                                                                                </FormControl>
                                                                            </FormItem>
                                                                        )}
                                                                    />
                                                                )
                                                            })}
                                                        </div>
                                                        {hasAttributeRestrictions &&
                                                            permissionsCollection.access.attributeRestrictions?.map(
                                                                (restriction) => {
                                                                    const roleConfig = restriction.roles.find(
                                                                        (restrictionRole) =>
                                                                            restrictionRole.role === role,
                                                                    )
                                                                    if (!roleConfig) return null
                                                                    return (
                                                                        <div
                                                                            key={`attribute-${permissionsCollection.labels.collection}-${restriction.type}`}
                                                                            className="flex flex-col gap-3 mt-4"
                                                                        >
                                                                            <FormField
                                                                                control={form.control}
                                                                                name={`attribute-${permissionsCollection.labels.collection}-${restriction.type}`}
                                                                                render={({ field: formField }) => {
                                                                                    let label: string | undefined
                                                                                    if (
                                                                                        restriction.type ===
                                                                                        "Record_Owner"
                                                                                    ) {
                                                                                        label = `Can only access own ${allTitles[permissionsCollection.labels.collection]}`
                                                                                    } else if (
                                                                                        restriction.type ===
                                                                                        "Record_User"
                                                                                    ) {
                                                                                        label = `Can only access assigned ${allTitles[permissionsCollection.labels.collection]}`
                                                                                    } else if (
                                                                                        restriction.type ===
                                                                                        "Record_Property"
                                                                                    ) {
                                                                                        label = `Only allow access to ${roleConfig.values?.join(", ")}`
                                                                                    }
                                                                                    return (
                                                                                        <FormItem className="flex flex-row items-center gap-2">
                                                                                            <FormControl>
                                                                                                <Checkbox
                                                                                                    checked={
                                                                                                        formField.value ||
                                                                                                        !roleConfig.assignable ||
                                                                                                        !!collectionPermissionWriteRestrictions?.attributeRestrictions?.includes(
                                                                                                            restriction.type,
                                                                                                        )
                                                                                                    }
                                                                                                    onCheckedChange={(
                                                                                                        checked,
                                                                                                    ) => {
                                                                                                        if (
                                                                                                            record?.User_ID
                                                                                                        ) {
                                                                                                            form.setValue(
                                                                                                                "operation",
                                                                                                                "update",
                                                                                                            )
                                                                                                        } else {
                                                                                                            form.setValue(
                                                                                                                "operation",
                                                                                                                "create",
                                                                                                            )
                                                                                                        }
                                                                                                        return checked
                                                                                                            ? formField.onChange(
                                                                                                                  true,
                                                                                                              )
                                                                                                            : formField.onChange(
                                                                                                                  false,
                                                                                                              )
                                                                                                    }}
                                                                                                    disabled={
                                                                                                        isDisabled ||
                                                                                                        !roleConfig.assignable ||
                                                                                                        !!collectionPermissionWriteRestrictions?.attributeRestrictions?.includes(
                                                                                                            restriction.type,
                                                                                                        )
                                                                                                    }
                                                                                                />
                                                                                            </FormControl>
                                                                                            <FormLabel className="text-sm font-normal relative bottom-1 text-primary">
                                                                                                {label}
                                                                                            </FormLabel>
                                                                                            <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                                                                                        </FormItem>
                                                                                    )
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    )
                                                                },
                                                            )}
                                                        {hasEntityRestrictions && (
                                                            <div className="flex flex-col gap-3 mt-4">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`restrict-${permissionsCollection.labels.collection}`}
                                                                    render={({ field: formField }) => {
                                                                        return (
                                                                            <FormItem className="flex flex-row items-center gap-2">
                                                                                <FormControl>
                                                                                    <Checkbox
                                                                                        checked={
                                                                                            formField.value ||
                                                                                            !permissionsCollection.access.entityRestrictions?.assignable?.some(
                                                                                                (restrictionRole) =>
                                                                                                    restrictionRole ===
                                                                                                    role,
                                                                                            ) ||
                                                                                            !!collectionPermissionWriteRestrictions?.restrictEntities
                                                                                        }
                                                                                        onCheckedChange={(checked) => {
                                                                                            if (record?.User_ID) {
                                                                                                form.setValue(
                                                                                                    "operation",
                                                                                                    "update",
                                                                                                )
                                                                                            } else {
                                                                                                form.setValue(
                                                                                                    "operation",
                                                                                                    "create",
                                                                                                )
                                                                                            }
                                                                                            return checked
                                                                                                ? formField.onChange(
                                                                                                      true,
                                                                                                  )
                                                                                                : formField.onChange(
                                                                                                      false,
                                                                                                  )
                                                                                        }}
                                                                                        disabled={
                                                                                            isDisabled ||
                                                                                            !permissionsCollection.access.entityRestrictions?.assignable?.some(
                                                                                                (restrictionRole) =>
                                                                                                    restrictionRole ===
                                                                                                    role,
                                                                                            ) ||
                                                                                            !!collectionPermissionWriteRestrictions?.restrictEntities
                                                                                        }
                                                                                    />
                                                                                </FormControl>
                                                                                <FormLabel className="text-sm font-normal relative bottom-1 text-primary">{`Limit accessible ${allTitles[permissionsCollection.labels.collection]}`}</FormLabel>
                                                                                <FormMessage className="bg-destructive p-4 rounded-md text-background dark:text-primary" />
                                                                            </FormItem>
                                                                        )
                                                                    }}
                                                                />
                                                                {(formValues[
                                                                    `restrict-${permissionsCollection.labels.collection}`
                                                                ] === true ||
                                                                    !permissionsCollection.access.entityRestrictions?.assignable?.some(
                                                                        (restrictionRole) => restrictionRole === role,
                                                                    ) ||
                                                                    collectionPermissionWriteRestrictions?.restrictEntities) && (
                                                                    <>
                                                                        {permissionsCollection.access.entityRestrictions?.restrictions?.map(
                                                                            (restriction) => {
                                                                                if (
                                                                                    !restriction.roles.some(
                                                                                        (restrictionRole) =>
                                                                                            restrictionRole.role ===
                                                                                            role,
                                                                                    )
                                                                                )
                                                                                    return null
                                                                                let parentCollection:
                                                                                    | CollectionSchema
                                                                                    | undefined
                                                                                if (
                                                                                    restriction.type === "Parent" ||
                                                                                    restriction.type ===
                                                                                        "Parent_Property"
                                                                                ) {
                                                                                    const collectionField = getField(
                                                                                        permissionsCollection.fields,
                                                                                        restriction.collectionField,
                                                                                    ) as RelationFieldType
                                                                                    parentCollection =
                                                                                        schema.collections[
                                                                                            collectionField.collection
                                                                                        ]
                                                                                }
                                                                                return (
                                                                                    <div
                                                                                        key={restriction.type}
                                                                                        className="flex flex-row gap-3 mt-2"
                                                                                    >
                                                                                        {restriction.type ===
                                                                                            "Individual" && (
                                                                                            <PermissionPicker
                                                                                                type="Individual"
                                                                                                form={form}
                                                                                                mainCollection={
                                                                                                    permissionsCollection
                                                                                                }
                                                                                                collection={
                                                                                                    permissionsCollection
                                                                                                }
                                                                                                title={
                                                                                                    allTitles[
                                                                                                        permissionsCollection
                                                                                                            .labels
                                                                                                            .collection
                                                                                                    ]
                                                                                                }
                                                                                                constraints={[]}
                                                                                                isDisabled={isDisabled}
                                                                                                hasUser={
                                                                                                    record?.User_ID
                                                                                                }
                                                                                            />
                                                                                        )}
                                                                                        {restriction.type ===
                                                                                            "Parent" &&
                                                                                            parentCollection && (
                                                                                                <PermissionPicker
                                                                                                    type="Parent"
                                                                                                    form={form}
                                                                                                    mainCollection={
                                                                                                        permissionsCollection
                                                                                                    }
                                                                                                    collection={
                                                                                                        parentCollection
                                                                                                    }
                                                                                                    title={
                                                                                                        allTitles[
                                                                                                            parentCollection
                                                                                                                .labels
                                                                                                                .collection
                                                                                                        ]
                                                                                                    }
                                                                                                    constraints={[]}
                                                                                                    isDisabled={
                                                                                                        isDisabled
                                                                                                    }
                                                                                                    hasUser={
                                                                                                        record?.User_ID
                                                                                                    }
                                                                                                />
                                                                                            )}
                                                                                        {restriction.type ===
                                                                                            "Parent_Property" &&
                                                                                            parentCollection && (
                                                                                                <PermissionPicker
                                                                                                    type="Parent_Property"
                                                                                                    form={form}
                                                                                                    mainCollection={
                                                                                                        permissionsCollection
                                                                                                    }
                                                                                                    collection={
                                                                                                        parentCollection
                                                                                                    }
                                                                                                    title={
                                                                                                        allTitles[
                                                                                                            parentCollection
                                                                                                                .labels
                                                                                                                .collection
                                                                                                        ]
                                                                                                    }
                                                                                                    constraints={[]}
                                                                                                    isDisabled={
                                                                                                        isDisabled
                                                                                                    }
                                                                                                    hasUser={
                                                                                                        record?.User_ID
                                                                                                    }
                                                                                                    formResetKey={
                                                                                                        formResetKey
                                                                                                    }
                                                                                                    formSavedKey={
                                                                                                        formSavedKey
                                                                                                    }
                                                                                                    restriction={
                                                                                                        restriction
                                                                                                    }
                                                                                                />
                                                                                            )}
                                                                                    </div>
                                                                                )
                                                                            },
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                            {record?.User_ID && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="w-full"
                                                            disabled={isDisabled || isPending}
                                                        >
                                                            <XCircle className="w-4 h-4 mr-2" /> Remove Access
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>
                                                                Are you absolutely sure?
                                                            </AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                {`This will remove system access for this ${labels.record}.`}
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => {
                                                                    form.setValue("operation", "delete")
                                                                    unsubscribe.current?.()
                                                                    permissionsLoaded.current = false
                                                                    for (const field of fields) {
                                                                        if (
                                                                            field.type === "Number" &&
                                                                            !field.autoIncrement &&
                                                                            form.getValues(field.name) === null
                                                                        ) {
                                                                            form.setValue(field.name, 0)
                                                                        }
                                                                        if (
                                                                            field.nullable &&
                                                                            form.getValues(field.name) === null
                                                                        ) {
                                                                            form.setValue(field.name, undefined)
                                                                        }
                                                                    }
                                                                    form.handleSubmit(handleSubmit, (errors) => {
                                                                        console.error(errors)
                                                                    })()
                                                                }}
                                                            >
                                                                Remove Access
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </>
                                    )}
                            </>
                        )}

                    {formUploadEnabled && operation === "create" && (
                        <>
                            <div className="flex items-center space-x-2 mt-4">
                                <div className="flex flex-col gap-2 space-y-2">
                                    <Label>Upload Files</Label>
                                    <input
                                        type="file"
                                        multiple
                                        className="block flex-1 text-[0px]
                                            file:mr-4 file:py-2 file:px-4
                                            file:rounded-lg file:border-0
                                            file:text-sm file:font-semibold
                                            file:bg-primary/10 file:text-primary
                                            file:cursor-pointer
                                            hover:file:bg-primary/20
                                            cursor-pointer"
                                        onChange={handleFormFileUpload}
                                    />

                                    {queuedUploads.length > 0 && (
                                        <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                                            <h4 className="text-sm font-medium mb-3">
                                                Selected Files ({queuedUploads.length})
                                            </h4>
                                            <div className="space-y-2">
                                                {queuedUploads.map((upload, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex items-center justify-between p-2 bg-background rounded border"
                                                    >
                                                        <div className="flex items-center space-x-2">
                                                            <FileIcon className="h-4 w-4 text-muted-foreground" />
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium">
                                                                    {upload.files.length === 1
                                                                        ? upload.customFilename || upload.files[0].name
                                                                        : `${upload.files.length} files`}
                                                                </span>
                                                                {upload.files.length === 1 && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {(upload.files[0].size / 1024 / 1024).toFixed(
                                                                            2,
                                                                        )}{" "}
                                                                        MB
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                setQueuedUploads((prev) =>
                                                                    prev.filter((_, i) => i !== index),
                                                                )
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Dialog open={showFilenameDialog} onOpenChange={setShowFilenameDialog}>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Edit Filename</DialogTitle>
                                        <DialogDescription className="hidden">
                                            You can edit the filename before uploading.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4">
                                        <div>
                                            <Input
                                                id="filename-input"
                                                value={editingFilename}
                                                onChange={(e) => setEditingFilename(e.target.value)}
                                                placeholder="Enter new filename"
                                                className="mt-1"
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        handleConfirmFilename()
                                                    } else if (e.key === "Escape") {
                                                        setShowFilenameDialog(false)
                                                        setPendingUploadFile(null)
                                                        setPendingUploadField(null)
                                                        setEditingFilename("")
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setShowFilenameDialog(false)
                                                setPendingUploadFile(null)
                                                setPendingUploadField(null)
                                                setEditingFilename("")
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                        <Button onClick={handleConfirmFilename} disabled={!editingFilename.trim()}>
                                            Upload
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </>
                    )}

                    <FilePermissionsDialog
                        open={showPermissionsDialog}
                        onOpenChange={setShowPermissionsDialog}
                        collection={collection}
                        filename={
                            permissionsContext === "files"
                                ? isMultipleFileUpload
                                    ? `${pendingUploadFiles.length} files`
                                    : editingFilename
                                : editingFilename
                        }
                        onConfirm={handlePermissionsConfirm}
                        onCancel={handlePermissionsCancel}
                        isMultipleFileUpload={permissionsContext === "files" && isMultipleFileUpload}
                    />

                    {draft && (
                        <AlertDialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Draft Found</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        A draft {labels.record} was found. Would you like to restore it or start fresh?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel
                                        onClick={() => {
                                            suppressDraftSaveRef.current = true
                                            localStorage.removeItem(`stoker-draft-${labels.collection}`)
                                            localStorage.removeItem(`stoker-draft-owner-${labels.collection}`)
                                            setShowDraftDialog(false)
                                            setDraftData(null)
                                        }}
                                    >
                                        Start Fresh
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => {
                                            const valuesClone = cloneDeep(draftData)
                                            deserializeTimestamps(valuesClone)
                                            form.reset(valuesClone)
                                            setShowDraftDialog(false)
                                            setDraftData(null)
                                        }}
                                    >
                                        Restore Draft
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}

                    {formLists && formLists.length > 0 && operation === "update" && (
                        <div className="flex flex-col gap-4 mb-2 w-full">
                            {formLists.map((formList) => {
                                const relationList = relationLists?.find(
                                    (relationList) => relationList.collection === formList.collection,
                                )
                                if (!relationList) return null
                                const schemaWithComputedFields = getSchema(true)
                                const relationCollection = schemaWithComputedFields.collections[formList.collection]
                                if (!relationCollection) return null
                                if (
                                    relationList.roles &&
                                    !(permissions?.Role && relationList.roles?.includes(permissions?.Role))
                                )
                                    return null
                                return (
                                    <div
                                        key={`${relationList.collection}-main`}
                                        className="w-full overflow-y-auto border rounded-lg h-[450px]"
                                    >
                                        <FiltersProvider
                                            key={`${relationList.collection}-filters`}
                                            collection={relationCollection}
                                        >
                                            <Collection
                                                key={`${relationList.collection}-collection`}
                                                collection={relationCollection}
                                                relationList={relationList}
                                                formList={formList}
                                                relationCollection={collection}
                                                relationParent={record}
                                                itemsPerPage={5}
                                                defaultSort={{
                                                    field: formList.sortField || relationCollection.recordTitleField,
                                                    direction: formList.sortDirection,
                                                }}
                                                additionalConstraints={(() => {
                                                    if (record) {
                                                        return [
                                                            [
                                                                `${relationList.field}_Array`,
                                                                "array-contains",
                                                                record.id,
                                                            ],
                                                        ]
                                                    }
                                                    return []
                                                })()}
                                            />
                                        </FiltersProvider>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {error && <div className="bg-destructive p-4 rounded-md text-white">{error}</div>}

                    {formButtons && formButtons.length > 0 && (
                        <div className="flex flex-col md:flex-row flex-wrap gap-2 mb-2">
                            {formButtons.map((button, index) => {
                                if (
                                    button.condition &&
                                    !tryFunction(button.condition, [
                                        operation,
                                        operation === "update" ? originalRecord : undefined,
                                    ])
                                )
                                    return null
                                return (
                                    <Button
                                        key={`form-button-${index}`}
                                        type="button"
                                        variant={button.variant}
                                        onClick={() =>
                                            button.action(
                                                operation,
                                                { ...(formValues as StokerRecord), id: record?.id },
                                                operation === "update" ? originalRecord : undefined,
                                            )
                                        }
                                        disabled={isGlobalLoading.has(record?.id)}
                                    >
                                        {button.icon &&
                                            createElement(button.icon, {
                                                className: "h-4 w-4 mr-2",
                                            })}
                                        {button.title}
                                    </Button>
                                )
                            })}
                        </div>
                    )}

                    {showDuplicateModal &&
                        duplicateRecordData &&
                        createPortal(
                            <div
                                id="create-record-modal"
                                className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in slide-in-from-top-4 duration-300"
                                aria-modal="true"
                                aria-live="polite"
                                role="dialog"
                            >
                                <div className="fixed inset-0 bg-black/50" />
                                <div
                                    className="relative bg-background sm:rounded-lg p-6 w-full max-w-2xl h-full sm:h-[90vh] overflow-y-auto border border-border"
                                    aria-labelledby="modal-title"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 id="modal-title" className="text-lg font-semibold">
                                            Create {recordTitle}
                                        </h2>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setShowDuplicateModal(false)
                                                setDuplicateRecordData(undefined)
                                                setIsDuplicate(false)
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <RecordForm
                                        collection={collection}
                                        operation="create"
                                        path={collectionPath || [labels.collection]}
                                        record={duplicateRecordData as StokerRecord}
                                        onSuccess={() => {
                                            setShowDuplicateModal(false)
                                            setDuplicateRecordData(undefined)
                                            setIsDuplicate(false)
                                        }}
                                    />
                                </div>
                            </div>,
                            document.body,
                        )}

                    {showConvertModal &&
                        convertRecordData &&
                        convertTargetCollection &&
                        createPortal(
                            <div
                                id="convert-record-modal"
                                className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in slide-in-from-top-4 duration-300"
                                aria-modal="true"
                                aria-live="polite"
                                role="dialog"
                            >
                                <div className="fixed inset-0 bg-black/50" />
                                <div
                                    className="relative bg-background sm:rounded-lg p-6 w-full max-w-2xl h-full sm:h-[90vh] overflow-y-auto border border-border"
                                    aria-labelledby="convert-modal-title"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 id="convert-modal-title" className="text-lg font-semibold">
                                            Convert to {allRecordTitles[convertTargetCollection.labels.collection]}
                                        </h2>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setShowConvertModal(false)
                                                setConvertRecordData(undefined)
                                                setConvertTargetCollection(undefined)
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <RecordForm
                                        collection={convertTargetCollection}
                                        operation="create"
                                        path={[convertTargetCollection.labels.collection]}
                                        record={convertRecordData as StokerRecord}
                                        onSuccess={() => {
                                            setShowConvertModal(false)
                                            setConvertRecordData(undefined)
                                            setConvertTargetCollection(undefined)
                                        }}
                                    />
                                </div>
                            </div>,
                            document.body,
                        )}

                    {isFormReady >= fields.length && (
                        <div className="flex flex-col md:flex-row gap-2 justify-between">
                            <div className="flex flex-col md:flex-row gap-2">
                                {operation === "update" && hasDeleteAccess && (
                                    <>
                                        {/* eslint-disable-next-line security/detect-object-injection */}
                                        {(!softDeleteField || prevState[softDeleteField] === false) &&
                                            (!softDeleteField ? (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            type="button"
                                                            variant="destructive"
                                                            disabled={
                                                                isDeleteDisabled ||
                                                                isPendingServer ||
                                                                isGlobalLoading.has(id)
                                                            }
                                                        >
                                                            Delete
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>
                                                                Are you absolutely sure?
                                                            </AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This action cannot be undone. This will permanently
                                                                delete the record.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleDelete}>
                                                                Permanently Delete
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    onClick={handleDelete}
                                                    disabled={
                                                        isDeleteDisabled || isPendingServer || isGlobalLoading.has(id)
                                                    }
                                                >
                                                    Delete
                                                </Button>
                                            ))}
                                        {/* eslint-disable-next-line security/detect-object-injection */}
                                        {softDeleteField && prevState[softDeleteField] === true && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleRestore}
                                                disabled={
                                                    isDeleteDisabled || isPendingServer || isGlobalLoading.has(id)
                                                }
                                            >
                                                Restore
                                            </Button>
                                        )}
                                    </>
                                )}
                                {operation === "update" && hasUpdateAccess && (
                                    <Button
                                        type="button"
                                        onClick={revert}
                                        disabled={!isDirty || isGlobalLoading.has(id) || isUpdateDisabled}
                                    >
                                        Revert
                                    </Button>
                                )}
                                {operation === "update" && hasCreateAccess && !disableCreate && (
                                    <>
                                        {enableDuplicate && (
                                            <Button type="button" onClick={duplicateRecord} disabled={isCreateDisabled}>
                                                Duplicate
                                            </Button>
                                        )}
                                        {convert && convert.length > 0 && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" disabled={isCreateDisabled}>
                                                        Convert
                                                        <ChevronDown className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {convert
                                                        .filter((convertConfig) => {
                                                            if (!permissions?.Role) return false
                                                            if (!convertAllowed[convertConfig.collection]) return false
                                                            if (
                                                                convertConfig.roles &&
                                                                convertConfig.roles.length > 0 &&
                                                                permissions.collections?.[convertConfig.collection] &&
                                                                collectionAccess(
                                                                    "Create",
                                                                    permissions.collections[convertConfig.collection],
                                                                )
                                                            ) {
                                                                return convertConfig.roles.includes(permissions?.Role)
                                                            }
                                                            return true
                                                        })
                                                        .map((convertConfig) => {
                                                            const targetCollection =
                                                                schema.collections[convertConfig.collection]
                                                            if (!targetCollection) return null
                                                            return (
                                                                <DropdownMenuItem
                                                                    key={convertConfig.collection}
                                                                    onClick={() => convertRecord(targetCollection)}
                                                                >
                                                                    {allRecordTitles[convertConfig.collection]}
                                                                </DropdownMenuItem>
                                                            )
                                                        })}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                    </>
                                )}
                            </div>
                            {((operation === "create" && hasCreateAccess) ||
                                (operation === "update" && hasUpdateAccess)) && (
                                <div className="flex gap-2 items-center">
                                    <Button
                                        className="w-full md:w-auto"
                                        type="button"
                                        onClick={() => {
                                            for (const field of fields) {
                                                if (
                                                    field.type === "Number" &&
                                                    !field.autoIncrement &&
                                                    form.getValues(field.name) === null
                                                ) {
                                                    form.setValue(field.name, 0)
                                                }
                                                if (field.nullable && form.getValues(field.name) === null) {
                                                    form.setValue(field.name, undefined)
                                                }
                                            }
                                            form.handleSubmit(handleSubmit, (errors) => {
                                                console.error(errors)
                                            })()
                                        }}
                                        disabled={
                                            (!isDirty && !isDuplicate) ||
                                            (operation === "create" && isCreateDisabled) ||
                                            (operation === "update" && (isUpdateDisabled || isPendingServer)) ||
                                            isGlobalLoading.has(id) ||
                                            isSaving
                                        }
                                    >
                                        Save
                                    </Button>
                                    {((operation === "update" && isPending) || isAddingServer) && (
                                        <LoadingSpinner size={7} className="inline ml-2" />
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </form>
            </Form>
        </>
    )
}

export { RecordForm }
