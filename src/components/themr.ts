import * as React from 'react'
import {TReactCSSThemrTheme} from './ThemeProvider'
import PropTypes = React.PropTypes
import Component = React.Component

export interface IThemrOptions {
  /** @default "deeply" */
  composeTheme: 'deeply' | 'softly' | false
}

export interface ThemeProviderProps {
  innerRef?: (...args: any[]) => any,
  theme: TReactCSSThemrTheme
}

const COMPOSE_DEEPLY = 'deeply'
const COMPOSE_SOFTLY = 'softly'
const DONT_COMPOSE = false

const DEFAULT_OPTIONS: IThemrOptions = {
  composeTheme: COMPOSE_DEEPLY
}

const THEMR_CONFIG: symbol | string = typeof Symbol !== 'undefined' ?
  Symbol('THEMR_CONFIG') :
  '__REACT_CSS_THEMR_CONFIG__'

type TThemedProps = {
  theme?: TReactCSSThemrTheme,
  themeNamespace?: string,
  composeTheme?: IThemrOptions['composeTheme'],
  innerRef?: ThemeProviderProps['innerRef']
}

type TComponentClass<P, S> = React.ComponentClass<P> & {
  new (props: P, context?: any): React.Component<P, S>;
}

/**
 * Themr decorator
 * @param identifier - Component name
 * @param [localTheme] - Base theme
 * @param [options] - Themr options
 * @returns {function(ThemedComponent:Function):Function} - ThemedComponent
 */
export function themr(identifier: string | number | symbol,
                      localTheme?: TReactCSSThemrTheme,
                      options: Partial<IThemrOptions> = {}) {

  return <P extends TThemedProps, S>(Target: TComponentClass<P, S> | React.SFC<P>): TComponentClass<P, S> => {
    const mergedOptions: IThemrOptions = { ...DEFAULT_OPTIONS, ...options }
    const { composeTheme } = mergedOptions
    validateComposeOption(composeTheme)

    let config: any = Target[ THEMR_CONFIG ]
    if (config && config.componentName === identifier) {
      config.localTheme = merge(config.localTheme, localTheme)
      //target can be an SFC, but themr returns ComponentClass and they are not castable
      return Target as TComponentClass<P, any>
    }

    config = {
      identifier,
      localTheme
    }

    class Themed extends React.Component<P, any> {
      static displayName = `Themed${Target.displayName || Target.name}`

      static contextTypes = {
        themr: PropTypes.object
      }

      static propTypes = {
        ...Target.propTypes,
        composeTheme: PropTypes.oneOf([ COMPOSE_DEEPLY, COMPOSE_SOFTLY, DONT_COMPOSE ]),
        innerRef: PropTypes.func,
        theme: PropTypes.object,
        themeNamespace: PropTypes.string
      }

      static defaultProps = {
        ...Target.defaultProps as any, //this will be fixed in TS soon with 'rest types'
        composeTheme
      }

      private theme_?: TReactCSSThemrTheme

      componentWillMount() {
        this.theme_ = this.calcTheme(this.props)
      }

      componentWillReceiveProps(nextProps: P) {
        if (
          nextProps.composeTheme !== this.props.composeTheme ||
          nextProps.theme !== this.props.theme ||
          nextProps.themeNamespace !== this.props.themeNamespace
        ) {
          this.theme_ = this.calcTheme(nextProps)
        }
      }

      private getNamespacedTheme(props: P): TReactCSSThemrTheme {
        const { themeNamespace, theme } = props
        if (!themeNamespace || !theme) {
          return theme || {}
        } else if (themeNamespace && !theme) {
          throw new Error('Invalid themeNamespace use in react-css-themr. ' +
            'themeNamespace prop should be used only with theme prop.')
        } else {
          return Object.keys(theme)
            .filter(key => key.startsWith(themeNamespace))
            .reduce((result, key) => ({ ...result, [removeNamespace(key, themeNamespace)]: theme[ key ] }), {})
        }
      }

      private getThemeNotComposed(props: P): TReactCSSThemrTheme {
        if (props.theme) {
          return this.getNamespacedTheme(props)
        }
        if (config.localTheme) {
          return config.localTheme
        }
        return this.getContextTheme()
      }

      private getContextTheme(): TReactCSSThemrTheme {
        return this.context.themr
          ? this.context.themr.theme[ config.componentName ]
          : {}
      }

      private getTheme(props: P): TReactCSSThemrTheme {
        if (props.composeTheme === COMPOSE_DEEPLY) {
          return {
            ...this.getContextTheme(),
            ...config.localTheme,
            ...this.getNamespacedTheme(props)
          }
        } else {
          return themeable(this.getContextTheme(), config.localTheme, this.getNamespacedTheme(props))
        }
      }

      private calcTheme(props: P): TReactCSSThemrTheme {
        const { composeTheme } = props
        return composeTheme
          ? this.getTheme(props)
          : this.getThemeNotComposed(props)
      }

      render() {
        //exclude themr-only props
        //noinspection JSUnusedLocalSymbols
        const { composeTheme, innerRef, themeNamespace, ...props } = this.props as any

        //ts cannot infer correct type of Target's union type because it is a mix of an SFC and ComponentClass
        return React.createElement(Target as TComponentClass<P, S>, {
          ...props,
          ref: innerRef,
          theme: this.theme_
        })
      }
    }

    Themed[ THEMR_CONFIG ] = config

    return Themed
  }
}
export default themr

/**
 * Merges passed themes by concatenating string keys and processing nested themes
 * @param themes - Themes
 * @returns - Resulting theme
 */
export function themeable(...themes: TReactCSSThemrTheme[]): TReactCSSThemrTheme {
  return themes.reduce((acc, theme) => merge(acc, theme), {})
}

/**
 * @param [original={}] - Original theme
 * @param [mixin={}] - Mixin theme
 * @returns - resulting theme
 */
function merge(original: TReactCSSThemrTheme = {}, mixin: TReactCSSThemrTheme = {}): TReactCSSThemrTheme {
  //make a copy to avoid mutations of nested objects
  //also strip all functions injected by isomorphic-style-loader
  const result = Object.keys(original).reduce((acc, key) => {
    const value = original[ key ]
    if (typeof value !== 'function') {
      acc[ key ] = value
    }
    return acc
  }, {})

  //traverse mixin keys and merge them to resulting theme
  Object.keys(mixin).forEach(key => {
    //there's no need to set any defaults here
    const originalValue = result[ key ]
    const mixinValue = mixin[ key ]

    switch (typeof mixinValue) {
      case 'object': {
        //possibly nested theme object
        switch (typeof originalValue) {
          case 'object': {
            //exactly nested theme object - go recursive
            //ts is unable to infer type from switch case based on typeof
            result[ key ] = merge(originalValue, mixinValue as {})
            break
          }

          case 'undefined': {
            //original does not contain this nested key - just take it as is
            result[ key ] = mixinValue
            break
          }

          default: {
            //can't merge an object with a non-object
            throw new Error(`You are merging object ${key} with a non-object ${originalValue}`)
          }
        }
        break
      }

      case 'undefined': //fallthrough - handles accidentally unset values which may come from props
      case 'function': {
        //this handles issue when isomorphic-style-loader addes helper functions to css-module
        break //just skip
      }

      default: {
        //plain values
        switch (typeof originalValue) {
          case 'object': {
            //can't merge a non-object with an object
            throw new Error(`You are merging non-object ${mixinValue} with an object ${key}`)
          }

          case 'undefined': {
            //mixin key is new to original theme - take it as is
            result[ key ] = mixinValue
            break
          }
          case 'function': {
            //this handles issue when isomorphic-style-loader addes helper functions to css-module
            break //just skip
          }

          default: {
            //finally we can merge
            //again, ts is unable to infer string type from switch
            result[ key ] = (originalValue as string).split(' ')
              .concat((mixinValue as string).split(' '))
              .filter((item, pos, self) => self.indexOf(item) === pos && item !== '')
              .join(' ')
            break
          }
        }
        break
      }
    }
  })

  return result
}

/**
 * Validates compose option
 * @param composeTheme - Compose them option
 * @throws
 */
function validateComposeOption(composeTheme: IThemrOptions['composeTheme']): void {
  if ([ COMPOSE_DEEPLY, COMPOSE_SOFTLY, DONT_COMPOSE ].indexOf(composeTheme) === -1) {
    throw new Error(
      `Invalid composeTheme option for react-css-themr. Valid composition options\
 are ${COMPOSE_DEEPLY}, ${COMPOSE_SOFTLY} and ${DONT_COMPOSE}. The given\
 option was ${composeTheme}`
    )
  }
}

/**
 * Removes namespace from key
 * @param key - Key
 * @param themeNamespace - Theme namespace
 * @returns - Key
 */
function removeNamespace(key: string, themeNamespace: string): string {
  const capitalized = key.substr(themeNamespace.length)
  return capitalized.slice(0, 1).toLowerCase() + capitalized.slice(1)
}
