/**
 * Auto components — stubs after removing @gadgetinc/react.
 * Use useFindMany/useFindOne from hooks/useApi with Table/Form from ui/ instead.
 */
import type { ComponentType } from "react";
import { Table } from "./ui/table";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const noop = () => null;
const FormStub: ComponentType<React.PropsWithChildren<Record<string, unknown>>> = ({ children, ...props }) => (
  <form {...props}>{children}</form>
);

export const AutoButton = Button;
export const AutoTable = Table;
export const AutoForm = FormStub;
export const AutoInput = Input;
export const AutoBooleanInput = Input;
export const AutoDateTimePicker = Input;
export const AutoEmailInput = Input;
export const AutoEncryptedStringInput = Input;
export const AutoEnumInput = Input;
export const AutoFileInput = Input;
export const AutoHiddenInput = Input;
export const AutoIdInput = Input;
export const AutoJSONInput = Input;
export const AutoNumberInput = Input;
export const AutoPasswordInput = Input;
export const AutoRichTextInput = Input;
export const AutoRolesInput = Input;
export const AutoStringInput = Input;
export const AutoTextAreaInput = Input;
export const AutoUrlInput = Input;
export const AutoBelongsToInput = Input;
export const AutoHasManyInput = Input;
export const AutoHasManyThroughInput = Input;
export const AutoHasOneInput = Input;
export const AutoBelongsToForm = FormStub;
export const AutoHasManyForm = FormStub;
export const AutoHasManyThroughForm = FormStub;
export const AutoHasManyThroughJoinModelForm = FormStub;
export const AutoHasOneForm = FormStub;
export const AutoSubmit = Button;
export const SubmitErrorBanner = noop;
export const SubmitResultBanner = noop;
export const SubmitSuccessfulBanner = noop;
