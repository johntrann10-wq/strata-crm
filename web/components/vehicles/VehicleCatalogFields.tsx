import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../../api";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, ChevronsUpDown, Loader2, ScanLine, Wrench } from "lucide-react";
import {
  buildVehicleDisplayName,
  type VehicleCatalogFormValue,
} from "../../lib/vehicles";
import { cn } from "@/lib/utils";

type CatalogOption = {
  id: string;
  label: string;
  value: string;
  source: string;
  sourceVehicleId: string | null;
  bodyStyle?: string | null;
  engine?: string | null;
};

type Props = {
  value: VehicleCatalogFormValue;
  setValue: Dispatch<SetStateAction<VehicleCatalogFormValue>>;
  compact?: boolean;
};

function SearchableCatalogSelect({
  options,
  value,
  selectedLabel,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled,
  loading,
  onSelect,
}: {
  options: CatalogOption[];
  value: string;
  selectedLabel: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  disabled?: boolean;
  loading?: boolean;
  onSelect: (option: CatalogOption) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between rounded-md px-3 font-normal"
        >
          <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
            {loading ? placeholder.replace("Select", "Loading") : selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] overflow-hidden p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === option.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function VehicleCatalogFields({ value, setValue, compact = false }: Props) {
  const [years, setYears] = useState<Array<{ id: string; year: number; label: string }>>([]);
  const [makes, setMakes] = useState<CatalogOption[]>([]);
  const [models, setModels] = useState<CatalogOption[]>([]);
  const [trims, setTrims] = useState<CatalogOption[]>([]);
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingTrims, setLoadingTrims] = useState(false);
  const [lookingUpVin, setLookingUpVin] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [useNativeMobileSelects, setUseNativeMobileSelects] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setUseNativeMobileSelects(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingYears(true);
    api.vehicleCatalog
      .listYears()
      .then((records) => {
        if (!active) return;
        setYears(records);
      })
      .finally(() => {
        if (active) setLoadingYears(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const parsedYear = Number.parseInt(value.year, 10);
    if (!Number.isFinite(parsedYear) || value.manualEntry) {
      setMakes([]);
      return;
    }
    let active = true;
    setLoadingMakes(true);
    api.vehicleCatalog
      .listMakes(parsedYear)
      .then((records) => {
        if (!active) return;
        setMakes(records);
      })
      .finally(() => {
        if (active) setLoadingMakes(false);
      });
    return () => {
      active = false;
    };
  }, [value.year, value.manualEntry]);

  useEffect(() => {
    const parsedYear = Number.parseInt(value.year, 10);
    if (!Number.isFinite(parsedYear) || !value.makeId || value.manualEntry) {
      setModels([]);
      return;
    }
    let active = true;
    setLoadingModels(true);
    api.vehicleCatalog
      .listModels({ year: parsedYear, makeId: value.makeId, make: value.make })
      .then((records) => {
        if (!active) return;
        setModels(records);
      })
      .finally(() => {
        if (active) setLoadingModels(false);
      });
    return () => {
      active = false;
    };
  }, [value.year, value.makeId, value.make, value.manualEntry]);

  useEffect(() => {
    const parsedYear = Number.parseInt(value.year, 10);
    if (!Number.isFinite(parsedYear) || !value.makeId || !value.model || value.manualEntry) {
      setTrims([]);
      return;
    }
    let active = true;
    setLoadingTrims(true);
    api.vehicleCatalog
      .listTrims({ year: parsedYear, makeId: value.makeId, make: value.make, model: value.model })
      .then((records) => {
        if (!active) return;
        setTrims(records);
      })
      .finally(() => {
        if (active) setLoadingTrims(false);
      });
    return () => {
      active = false;
    };
  }, [value.year, value.makeId, value.make, value.model, value.manualEntry]);

  const updateValue = (patch: Partial<VehicleCatalogFormValue>) => {
    setValue((current) => {
      const next = { ...current, ...patch };
      return {
        ...next,
        displayName: buildVehicleDisplayName(next),
      };
    });
  };

  const handleVinLookup = async () => {
    const vin = value.vin.trim();
    if (vin.length < 11) {
      setLookupError("Enter at least 11 VIN characters to look up the vehicle.");
      return;
    }
    setLookupError(null);
    setLookingUpVin(true);
    try {
      const decoded = await api.vehicleCatalog.vinLookup(vin);
      if (!decoded) {
        setLookupError("No vehicle details were found for that VIN. Use manual entry if needed.");
        return;
      }
      setValue((current) => ({
        ...current,
        year: decoded.year ? String(decoded.year) : "",
        make: decoded.make ?? "",
        makeId: "",
        model: decoded.model ?? "",
        modelId: "",
        trim: decoded.trim ?? "",
        bodyStyle: decoded.bodyStyle ?? "",
        engine: decoded.engine ?? "",
        vin: decoded.vin,
        displayName: decoded.displayName,
        source: decoded.source,
        sourceVehicleId: decoded.sourceVehicleId ?? decoded.vin,
        manualEntry: true,
      }));
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "VIN lookup failed.");
    } finally {
      setLookingUpVin(false);
    }
  };

  const yearChoices = years.length > 0 ? years : [];

  const mobileSelectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="vehicle-vin">VIN</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="vehicle-vin"
            value={value.vin}
            onChange={(event) => updateValue({ vin: event.target.value, source: value.source || "manual" })}
            placeholder="Enter VIN for lookup or keep blank"
            maxLength={17}
          />
          <Button type="button" variant="outline" onClick={() => void handleVinLookup()} disabled={lookingUpVin}>
            {lookingUpVin ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}
            Lookup VIN
          </Button>
        </div>
        {lookupError ? <p className="text-xs text-destructive">{lookupError}</p> : null}
      </div>

      {value.manualEntry ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <div className="flex min-h-10 items-center justify-between gap-2">
              <Label htmlFor="vehicle-year">Year</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-lg px-2 text-xs"
                onClick={() =>
                  updateValue({
                    manualEntry: false,
                    source: value.source || "nhtsa_vpic",
                  })
                }
              >
                <Wrench className="mr-1.5 h-3.5 w-3.5" />
                Use catalog
              </Button>
            </div>
            <Input
              id="vehicle-year"
              value={value.year}
              onChange={(event) => updateValue({ year: event.target.value })}
              placeholder="2024"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle-make">
              Make <span className="text-destructive">*</span>
            </Label>
            <Input
              id="vehicle-make"
              value={value.make}
              onChange={(event) => updateValue({ make: event.target.value, makeId: "", source: "manual", sourceVehicleId: "" })}
              placeholder="Toyota"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle-model">
              Model <span className="text-destructive">*</span>
            </Label>
            <Input
              id="vehicle-model"
              value={value.model}
              onChange={(event) => updateValue({ model: event.target.value, modelId: "", source: "manual", sourceVehicleId: "" })}
              placeholder="Camry"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle-trim">Trim</Label>
            <Input
              id="vehicle-trim"
              value={value.trim}
              onChange={(event) => updateValue({ trim: event.target.value })}
              placeholder="XSE"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <div className="flex min-h-10 items-center justify-between gap-2">
              <Label>Year</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-lg px-2 text-xs"
                onClick={() =>
                  updateValue({
                    manualEntry: true,
                    source: "manual",
                  })
                }
              >
                <Wrench className="mr-1.5 h-3.5 w-3.5" />
                Manual
              </Button>
            </div>
            {useNativeMobileSelects ? (
              <select
                className={mobileSelectClassName}
                value={value.year}
                onChange={(event) =>
                  updateValue({
                    year: event.target.value,
                    make: "",
                    makeId: "",
                    model: "",
                    modelId: "",
                    trim: "",
                    bodyStyle: "",
                    engine: "",
                    source: "nhtsa_vpic",
                    sourceVehicleId: "",
                  })
                }
                disabled={loadingYears}
              >
                <option value="">{loadingYears ? "Loading years..." : "Select year"}</option>
                {yearChoices.map((entry) => (
                  <option key={entry.id} value={String(entry.year)}>
                    {entry.label}
                  </option>
                ))}
              </select>
            ) : (
              <Select value={value.year} onValueChange={(selectedYear) => updateValue({ year: selectedYear, make: "", makeId: "", model: "", modelId: "", trim: "", bodyStyle: "", engine: "", source: "nhtsa_vpic", sourceVehicleId: "" })}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingYears ? "Loading years..." : "Select year"} />
                </SelectTrigger>
                <SelectContent>
                  {yearChoices.map((entry) => (
                    <SelectItem key={entry.id} value={String(entry.year)}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Make <span className="text-destructive">*</span>
            </Label>
            <SearchableCatalogSelect
              options={makes}
              value={value.makeId}
              selectedLabel={value.make}
              placeholder="Select make"
              searchPlaceholder="Search makes..."
              emptyMessage={value.year ? "No makes found." : "Select a year first."}
              disabled={!value.year || loadingMakes}
              loading={loadingMakes}
              onSelect={(selected) => {
                updateValue({
                  makeId: selected.id,
                  make: selected.value,
                  model: "",
                  modelId: "",
                  trim: "",
                  bodyStyle: "",
                  engine: "",
                  source: selected.source ?? "nhtsa_vpic",
                  sourceVehicleId: selected.sourceVehicleId ?? "",
                });
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Model <span className="text-destructive">*</span>
            </Label>
            <SearchableCatalogSelect
              options={models}
              value={value.modelId}
              selectedLabel={value.model}
              placeholder="Select model"
              searchPlaceholder="Search models..."
              emptyMessage={value.makeId ? "No models found." : "Select a make first."}
              disabled={!value.makeId || loadingModels}
              loading={loadingModels}
              onSelect={(selected) => {
                updateValue({
                  modelId: selected.id,
                  model: selected.value,
                  trim: "",
                  bodyStyle: "",
                  engine: "",
                  source: selected.source ?? "nhtsa_vpic",
                  sourceVehicleId: selected.sourceVehicleId ?? "",
                });
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Trim</Label>
            {trims.length > 0 ? (
              useNativeMobileSelects ? (
                <select
                  className={mobileSelectClassName}
                  value={value.trim}
                  onChange={(event) => {
                    const nextTrim = event.target.value;
                    const selected = trims.find((entry) => entry.value === nextTrim);
                    updateValue({
                      trim: nextTrim,
                      bodyStyle: selected?.bodyStyle ?? value.bodyStyle,
                      engine: selected?.engine ?? value.engine,
                      sourceVehicleId: selected?.sourceVehicleId ?? value.sourceVehicleId,
                    });
                  }}
                  disabled={loadingTrims}
                >
                  <option value="">{loadingTrims ? "Loading trims..." : "Select trim"}</option>
                  {trims.map((entry) => (
                    <option key={entry.id} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Select
                  value={value.trim}
                  onValueChange={(nextTrim) => {
                    const selected = trims.find((entry) => entry.value === nextTrim);
                    updateValue({
                      trim: nextTrim,
                      bodyStyle: selected?.bodyStyle ?? value.bodyStyle,
                      engine: selected?.engine ?? value.engine,
                      sourceVehicleId: selected?.sourceVehicleId ?? value.sourceVehicleId,
                    });
                  }}
                  disabled={loadingTrims}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingTrims ? "Loading trims..." : "Select trim"} />
                  </SelectTrigger>
                  <SelectContent>
                    {trims.map((entry) => (
                      <SelectItem key={entry.id} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : (
              <Input
                value={value.trim}
                onChange={(event) => updateValue({ trim: event.target.value })}
                placeholder={loadingTrims ? "Looking up trims..." : "Enter trim if known"}
                disabled={loadingTrims || !value.model}
              />
            )}
          </div>
        </div>
      )}

      {!compact ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="vehicle-body-style">Body Style</Label>
            <Input
              id="vehicle-body-style"
              value={value.bodyStyle}
              onChange={(event) => updateValue({ bodyStyle: event.target.value })}
              placeholder="Sedan, Coupe, SUV..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle-engine">Engine</Label>
            <Input
              id="vehicle-engine"
              value={value.engine}
              onChange={(event) => updateValue({ engine: event.target.value })}
              placeholder="2.5L I4"
            />
          </div>
        </div>
      ) : null}

      {value.displayName ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Display name</p>
          <p className="mt-1 text-sm font-medium text-foreground">{value.displayName}</p>
        </div>
      ) : null}
    </div>
  );
}
